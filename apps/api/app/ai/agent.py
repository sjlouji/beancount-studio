"""The ledger assistant: a provider-neutral tool-use loop streamed through assistant-stream."""

from __future__ import annotations

from typing import Any

from assistant_stream import RunController

from app.ai.providers import ProviderError, ToolResult, get_provider, wrap_raw_turn
from app.ai.tools import APPROVAL_TOOL, READ_TOOLS, WRITE_TOOLS, ToolContext, execute_tool
from app.config import Settings
from app.core.deps import LedgerAccess
from app.ledgers.store import LedgerStore
from app.logging_setup import get_logger

log = get_logger(__name__)

SYSTEM_PROMPT = """You are the accounting assistant inside Beancount Studio, working on the user's Beancount ledger.
You can query the ledger, read its files, run financial reports and - with the user's explicit approval - edit ledger files.
Apply double-entry discipline and follow the ledger's existing conventions (account names, currencies, date style, file layout) over your own preferences.

## Workflow
- Start by calling get_ledger_summary when you need account names, currencies, payees or file layout.
- For numbers, prefer run_bql_query or get_report over guessing. Quote concrete figures with their currency.
- To change the ledger: read the relevant file region first, build the exact file operations, validate them with check_ledger_edit,
  then call request_approval with a clear one-sentence description and the operations. The user sees the diff and approves or rejects.
  Only after an approval result may you call edit_ledger_files with the identical arguments. Never claim a change was made unless edit_ledger_files reported committed=true.
- Append new transactions to the file that already holds similar transactions, in date order, matching the ledger's formatting. Use an account only if it is open; otherwise add an `open` directive in the same change or ask.
- If the user rejects a change, ask what to adjust before retrying.

## Transactions
  YYYY-MM-DD * "Payee" "Narration"
    Expenses:Category        12.50 USD
    Assets:Bank:Checking                 ; auto-balances when omitted
Flags: * cleared, ! pending. Expenses are positive; the funding asset or liability is negative.

## Uploaded files
When the user attaches a receipt, invoice or statement, read it directly: extract date, payee, amounts and currency, propose the entry
with suitable accounts from the ledger, and insert it only after approval. For statements with many rows, summarise the count and date range before proposing.

Be concise. Use short paragraphs or compact tables; no filler."""

READ_ONLY_NOTE = """

## Access
This conversation is READ-ONLY: the user cannot modify this ledger. Do not propose edits; instead draft the exact Beancount text they could add themselves."""


def _frontend_tools(tools: dict[str, Any] | None) -> list[dict[str, Any]]:
    """assistant-ui sends frontend tools as {name: {description, parameters}}."""
    out = []
    for name, spec in (tools or {}).items():
        if not isinstance(spec, dict):
            continue
        schema = (
            spec.get("parameters")
            or spec.get("input_schema")
            or {"type": "object", "properties": {}}
        )
        out.append(
            {"name": name, "description": spec.get("description") or "", "input_schema": schema}
        )
    return out


def build_tools(
    access: LedgerAccess, frontend_tools: dict[str, Any] | None
) -> tuple[list[dict[str, Any]], set[str]]:
    """Backend tools plus the frontend-declared ones (minus any that shadow a backend tool)."""
    tools = list(READ_TOOLS)
    if access.can_write:
        tools += WRITE_TOOLS
    backend_names = {t["name"] for t in tools}
    frontend = [t for t in _frontend_tools(frontend_tools) if t["name"] not in backend_names]
    if not access.can_write:
        frontend = [t for t in frontend if t["name"] != APPROVAL_TOOL]
    tools += frontend
    return tools, {t["name"] for t in frontend}


class _ControllerEvents:
    """Bridges provider stream events onto the assistant-stream run controller."""

    def __init__(self, controller: RunController) -> None:
        self.controller = controller
        self.tool_controllers: dict[str, Any] = {}

    def on_text(self, delta: str) -> None:
        self.controller.append_text(delta)

    def on_reasoning(self, delta: str) -> None:
        self.controller.append_reasoning(delta)

    async def on_tool_call_start(self, tool_call_id: str, name: str) -> None:
        self.tool_controllers[tool_call_id] = await self.controller.add_tool_call(
            name, tool_call_id
        )

    def on_tool_call_delta(self, tool_call_id: str, partial_json: str) -> None:
        tc = self.tool_controllers.get(tool_call_id)
        if tc is not None:
            tc.append_args_text(partial_json)


class AgentRun:
    """One streamed agent turn. Collects the raw assistant turns for append-only replay."""

    def __init__(
        self,
        *,
        settings: Settings,
        store: LedgerStore,
        access: LedgerAccess,
        request_messages: list[dict[str, Any]],
        frontend_tools: dict[str, Any] | None,
        extra_system: str | None,
        raw_turns: dict[str, Any],
        approved_hashes: set[str],
    ) -> None:
        self.settings = settings
        self.store = store
        self.access = access
        self.request_messages = request_messages
        self.frontend_tools = frontend_tools
        self.extra_system = extra_system
        self.raw_turns = raw_turns
        self.ctx = ToolContext(store=store, access=access, approved_hashes=approved_hashes)
        # Output collected for persistence (assistant-ui ThreadMessageLike content parts).
        self.parts: list[dict[str, Any]] = []
        self.new_raw_turns: dict[str, Any] = {}

    async def run(self, controller: RunController) -> None:
        settings = self.settings
        provider = get_provider(settings)
        systems, messages = provider.convert_history(self.request_messages, self.raw_turns)
        if not messages:
            controller.add_error("The conversation has no user message")
            return
        tools, frontend_names = build_tools(self.access, self.frontend_tools)
        system_text = SYSTEM_PROMPT + ("" if self.access.can_write else READ_ONLY_NOTE)
        if self.extra_system:
            system_text += "\n\n" + self.extra_system
        if systems:
            system_text += "\n\n" + "\n\n".join(systems)
        events = _ControllerEvents(controller)

        for _step in range(settings.ai_max_steps):
            if controller.is_cancelled:
                return
            try:
                turn = await provider.stream_turn(
                    model=settings.resolved_ai_model,
                    system=system_text,
                    messages=messages,
                    tools=tools,
                    events=events,
                )
            except ProviderError as exc:
                log.error("assistant turn failed (%s): %s", exc.kind, exc.message)
                controller.add_error(exc.user_message)
                return

            if turn.text:
                self.parts.append({"type": "text", "text": turn.text})
            for call in turn.tool_calls:
                self.new_raw_turns[call.id] = wrap_raw_turn(provider.name, turn.raw_assistant)
                self.parts.append(
                    {
                        "type": "tool-call",
                        "toolCallId": call.id,
                        "toolName": call.name,
                        "args": call.input,
                    }
                )

            if turn.stop_reason == "refusal":
                controller.add_error("The assistant declined this request.")
                return
            if turn.stop_reason == "max_tokens" and turn.tool_calls:
                controller.add_error(
                    "The response was cut off before the tool call completed. Please try again."
                )
                return
            if not turn.tool_calls:
                return

            messages.append(turn.raw_assistant)
            results: list[ToolResult] = []
            waiting_for_frontend = False
            for call in turn.tool_calls:
                if call.name in frontend_names:
                    waiting_for_frontend = True
                    continue
                if call.input_error:
                    result: Any = {"error": call.input_error}
                    is_error = True
                else:
                    result, is_error = await execute_tool(self.ctx, call.name, call.input)
                tc = events.tool_controllers.get(call.id)
                if tc is not None:
                    tc.set_response(result, is_error=is_error)
                for part in self.parts:
                    if part.get("toolCallId") == call.id:
                        part["result"] = result
                        if is_error:
                            part["isError"] = True
                results.append(
                    ToolResult(
                        tool_call_id=call.id, name=call.name, result=result, is_error=is_error
                    )
                )
            if waiting_for_frontend:
                # The user must answer (approve/reject) before the loop can continue.
                return
            messages.extend(provider.tool_result_messages(results))
        controller.append_text(
            "\n\n_I stopped after reaching the step limit for one turn. Ask me to continue if needed._"
        )
