"""The ledger assistant: an Anthropic tool-use loop streamed through assistant-stream."""

from __future__ import annotations

import json
from typing import Any

import anthropic
from assistant_stream import RunController

from app.ai.client import get_client
from app.ai.messages import to_anthropic_messages
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
    tools = list(READ_TOOLS)
    frontend = _frontend_tools(frontend_tools)
    frontend_names = {t["name"] for t in frontend}
    if access.can_write:
        tools += WRITE_TOOLS
        tools += frontend
    else:
        tools += [t for t in frontend if t["name"] != APPROVAL_TOOL]
        frontend_names.discard(APPROVAL_TOOL)
    return tools, frontend_names


class AgentRun:
    """One streamed agent turn. Collects the raw assistant blocks for append-only replay."""

    def __init__(
        self,
        *,
        settings: Settings,
        store: LedgerStore,
        access: LedgerAccess,
        request_messages: list[dict[str, Any]],
        frontend_tools: dict[str, Any] | None,
        extra_system: str | None,
        raw_turns: dict[str, list[dict[str, Any]]],
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
        self.new_raw_turns: dict[str, list[dict[str, Any]]] = {}

    async def run(self, controller: RunController) -> None:
        settings = self.settings
        client = get_client(settings)
        systems, messages = to_anthropic_messages(self.request_messages, self.raw_turns)
        if not messages:
            controller.add_error("The conversation has no user message")
            return
        tools, frontend_names = build_tools(self.access, self.frontend_tools)
        system_text = SYSTEM_PROMPT + ("" if self.access.can_write else READ_ONLY_NOTE)
        if self.extra_system:
            system_text += "\n\n" + self.extra_system
        if systems:
            system_text += "\n\n" + "\n\n".join(systems)
        system_blocks = [
            {"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}
        ]

        for _step in range(settings.ai_max_steps):
            if controller.is_cancelled:
                return
            try:
                async with client.beta.messages.stream(
                    model=settings.ai_model,
                    max_tokens=16000,
                    system=system_blocks,
                    messages=messages,
                    tools=tools,
                    output_config={"effort": "medium"},
                    betas=["server-side-fallback-2026-07-01"],
                    fallbacks="default",
                ) as stream:
                    tool_controllers: dict[int, Any] = {}
                    async for event in stream:
                        if controller.is_cancelled:
                            return
                        if event.type == "content_block_start":
                            block = event.content_block
                            if block.type == "tool_use":
                                tool_controllers[event.index] = await controller.add_tool_call(
                                    block.name, block.id
                                )
                        elif event.type == "content_block_delta":
                            delta = event.delta
                            if delta.type == "text_delta":
                                controller.append_text(delta.text)
                            elif delta.type == "input_json_delta":
                                tc = tool_controllers.get(event.index)
                                if tc is not None:
                                    tc.append_args_text(delta.partial_json)
                    final = await stream.get_final_message()
            except anthropic.RateLimitError as exc:
                log.warning("assistant rate limited: %s", exc)
                controller.add_error(
                    "The AI provider is rate limiting requests. Please try again in a moment."
                )
                return
            except anthropic.AuthenticationError as exc:
                log.error("assistant auth error: %s", exc)
                controller.add_error(
                    "The server's AI credentials were rejected. Ask the administrator to check the API key."
                )
                return
            except anthropic.APIStatusError as exc:
                log.error("assistant API error %s: %s", exc.status_code, exc.message)
                controller.add_error(f"AI request failed ({exc.status_code}): {exc.message}")
                return
            except anthropic.APIConnectionError as exc:
                log.error("assistant connection error: %s", exc)
                controller.add_error(
                    "Could not reach the AI provider. Check the server's network connection."
                )
                return

            raw_blocks = [b.model_dump(mode="json", exclude_none=True) for b in final.content]
            text_parts = [b.text for b in final.content if b.type == "text" and b.text]
            tool_uses = [b for b in final.content if b.type == "tool_use"]
            for text in text_parts:
                self.parts.append({"type": "text", "text": text})
            for block in tool_uses:
                self.new_raw_turns[block.id] = raw_blocks
                self.parts.append(
                    {
                        "type": "tool-call",
                        "toolCallId": block.id,
                        "toolName": block.name,
                        "args": block.input,
                    }
                )

            if final.stop_reason == "refusal":
                controller.add_error("The assistant declined this request.")
                return
            if final.stop_reason == "max_tokens" and tool_uses:
                controller.add_error(
                    "The response was cut off before the tool call completed. Please try again."
                )
                return
            if not tool_uses:
                return

            messages.append({"role": "assistant", "content": raw_blocks})
            results: list[dict[str, Any]] = []
            waiting_for_frontend = False
            for block in tool_uses:
                args = block.input if isinstance(block.input, dict) else {}
                if block.name in frontend_names:
                    waiting_for_frontend = True
                    continue
                result, is_error = await execute_tool(self.ctx, block.name, args)
                tc = next(
                    (c for c in tool_controllers.values() if c.tool_call_id == block.id), None
                )
                if tc is not None:
                    tc.set_response(result, is_error=is_error)
                for part in self.parts:
                    if part.get("toolCallId") == block.id:
                        part["result"] = result
                        if is_error:
                            part["isError"] = True
                results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result, ensure_ascii=False, default=str),
                        "is_error": is_error,
                    }
                )
            if waiting_for_frontend:
                # The user must answer (approve/reject) before the loop can continue.
                return
            messages.append({"role": "user", "content": results})
        controller.append_text(
            "\n\n_I stopped after reaching the step limit for one turn. Ask me to continue if needed._"
        )
