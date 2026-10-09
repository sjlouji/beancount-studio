"""Centralised logging configuration. Every module logs through `get_logger`."""

from __future__ import annotations

import logging
import sys


def configure_logging(level: str) -> None:
    root = logging.getLogger()
    root.setLevel(level.upper())
    if root.handlers:
        for handler in root.handlers:
            handler.setLevel(level.upper())
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s", "%Y-%m-%dT%H:%M:%S")
    )
    root.addHandler(handler)
    # Quiet noisy third parties
    for noisy in ("httpx", "httpcore", "watchfiles", "anthropic._base_client"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
