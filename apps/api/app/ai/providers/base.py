"""Provider-neutral contract for the assistant.

A provider turns the app's message history into its native format, streams one model turn
(text, reasoning, tool calls), and formats tool results for the next turn. Tool definitions
are passed in the neutral `{name, description, input_schema}` shape.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from app.config import Settings

StopReason = Literal["end_turn", "tool_use", "max_tokens", "refusal"]
ErrorKind = Literal["auth", "rate_limit", "connection", "api", "unsupported"]

AI_DISABLED_MESSAGE = (
    "The AI assistant is not configured. Set BS_ANTHROPIC_API_KEY, or point BS_OPENAI_BASE_URL "
    "at an OpenAI-compatible server (Ollama, vLLM, LM Studio, ...) and set BS_AI_MODEL."
)


class ProviderError(Exception):
    """A model-provider failure with a message safe to show to the user."""

    def __init__(self, message: str, *, kind: ErrorKind = "api", status: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.kind = kind
        self.status = status

    @property
    def user_message(self) -> str:
        if self.kind == "rate_limit":
            return "The AI provider is rate limiting requests. Please try again in a moment."
        if self.kind == "auth":
            return "The server's AI credentials were rejected. Ask the administrator to check the configuration."
        if self.kind == "connection":
            return "Could not reach the AI provider. Check the server's network connection and BS_OPENAI_BASE_URL / provider settings."
        return self.message


@dataclass
class ToolCall:
    id: str
    name: str
    input: dict[str, Any]
    #: Set when the model produced arguments that are not valid JSON.
    input_error: str | None = None


@dataclass
class ToolResult:
    tool_call_id: str
    name: str
    result: Any
    is_error: bool = False


@dataclass
class TurnResult:
    text: str
    tool_calls: list[ToolCall]
    stop_reason: StopReason
    #: The provider-native assistant message to append to the history for the next step.
    raw_assistant: Any
    usage: dict[str, int] = field(default_factory=dict)


class StreamEvents(Protocol):
    def on_text(self, delta: str) -> None: ...

    def on_reasoning(self, delta: str) -> None: ...

    async def on_tool_call_start(self, tool_call_id: str, name: str) -> None: ...

    def on_tool_call_delta(self, tool_call_id: str, partial_json: str) -> None: ...


#: Neutral content parts for one-shot generation:
#: {"type": "text", "text": str}
#: {"type": "image", "media_type": str, "data": base64 str}
#: {"type": "pdf", "data": base64 str, "filename": str}
ContentPart = dict[str, Any]

#: Stored per tool-call id so a later request can replay the exact assistant turn.
RawTurn = dict[str, Any]


def wrap_raw_turn(provider: str, message: Any) -> RawTurn:
    return {"provider": provider, "message": message}


def unwrap_raw_turns(raw_turns: dict[str, Any] | None, provider: str) -> dict[str, Any]:
    """Return {tool_call_id: native message} for turns produced by `provider`.

    Legacy entries (a bare list of Anthropic content blocks) belong to the anthropic provider.
    """
    out: dict[str, Any] = {}
    for tool_call_id, stored in (raw_turns or {}).items():
        if isinstance(stored, dict) and "provider" in stored:
            if stored.get("provider") == provider:
                out[tool_call_id] = stored.get("message")
        elif isinstance(stored, list) and provider == "anthropic":
            out[tool_call_id] = {"role": "assistant", "content": stored}
    return out


class ChatProvider(ABC):
    name: str = "base"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @abstractmethod
    def convert_history(
        self, messages: list[dict[str, Any]], raw_turns: dict[str, Any] | None
    ) -> tuple[list[str], list[Any]]:
        """Convert assistant-ui (LanguageModelV2) messages into native messages.

        Returns (extra system strings, native messages).
        """

    @abstractmethod
    async def stream_turn(
        self,
        *,
        model: str,
        system: str,
        messages: list[Any],
        tools: list[dict[str, Any]],
        events: StreamEvents,
        max_tokens: int = 16000,
    ) -> TurnResult:
        """Stream one assistant turn, emitting deltas through `events`."""

    @abstractmethod
    def tool_result_messages(self, results: list[ToolResult]) -> list[Any]:
        """Native message(s) carrying tool results back to the model."""

    @abstractmethod
    async def generate_json(
        self,
        *,
        model: str,
        system: str,
        parts: list[ContentPart],
        schema: dict[str, Any],
        max_tokens: int = 16000,
    ) -> dict[str, Any]:
        """One-shot structured generation (categorisation, receipt extraction)."""
