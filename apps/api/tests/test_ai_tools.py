from __future__ import annotations

from app.ai.messages import to_anthropic_messages
from app.ai.tools import approved_hashes_from_messages, operations_hash


def test_to_anthropic_messages_roundtrip():
    files = [{"operation": "append", "path": "main.bean", "content": "x"}]
    messages = [
        {"role": "system", "content": "extra"},
        {"role": "user", "content": [{"type": "text", "text": "Add a coffee"}]},
        {
            "role": "assistant",
            "content": [
                {"type": "text", "text": "Sure"},
                {
                    "type": "tool-call",
                    "toolCallId": "t1",
                    "toolName": "request_approval",
                    "input": {"description": "Add coffee", "files": files},
                },
            ],
        },
        {
            "role": "tool",
            "content": [
                {
                    "type": "tool-result",
                    "toolCallId": "t1",
                    "toolName": "request_approval",
                    "output": {"type": "json", "value": {"approved": True}},
                }
            ],
        },
    ]
    systems, out = to_anthropic_messages(messages)
    assert systems == ["extra"]
    assert [m["role"] for m in out] == ["user", "assistant", "user"]
    assert out[1]["content"][1]["type"] == "tool_use"
    assert out[2]["content"][0]["type"] == "tool_result"
    assert approved_hashes_from_messages(messages) == {operations_hash(files)}

    raw = {
        "t1": [
            {"type": "thinking", "thinking": "", "signature": "sig"},
            {"type": "tool_use", "id": "t1", "name": "request_approval", "input": {}},
        ]
    }
    _, replayed = to_anthropic_messages(messages, raw)
    assert replayed[1]["content"] == raw["t1"]


def test_image_data_url_becomes_image_block():
    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "file",
                    "data": "data:image/png;base64,aGVsbG8=",
                    "mediaType": "image/png",
                },
                {"type": "text", "text": "receipt"},
            ],
        }
    ]
    _, out = to_anthropic_messages(messages)
    assert out[0]["content"][0]["type"] == "image"
    assert out[0]["content"][0]["source"]["media_type"] == "image/png"
