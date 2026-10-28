"""Live updates: a Server-Sent Events stream that tells each signed-in browser which fault changed.

Events carry only ids and an action, never fault content: the browser re-reads what it shows
through the normal, authorised API. Who gets an event mirrors who may read the fault:
leads and admins see every fault; a worker only faults they reported, and never internal notes.

State lives in process memory, which matches the single-replica deployment. With more than one
replica, publishing would need a shared channel (PostgreSQL LISTEN/NOTIFY), not a paid service.
A client that reconnects, or falls behind, re-reads its views instead of replaying missed events.
"""
from __future__ import annotations

import asyncio
import itertools
import json
import logging
import threading
from dataclasses import dataclass, field

logger = logging.getLogger("adixpaper")

QUEUE_SIZE = 100
HEARTBEAT_SECONDS = 20.0


@dataclass(eq=False)
class Subscriber:
    user_id: int
    manager: bool
    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=QUEUE_SIZE))
    overflowed: bool = False

    def may_see(self, reporter_id: int | None, internal: bool) -> bool:
        if self.manager:
            return True
        return reporter_id == self.user_id and not internal

    def offer(self, event: dict) -> None:
        """Runs on the subscriber's event loop."""
        if self.overflowed:
            return
        try:
            self.queue.put_nowait(event)
        except asyncio.QueueFull:
            # Too far behind: tell the browser to re-read everything instead of queueing forever.
            self.overflowed = True


class Broker:
    def __init__(self) -> None:
        self._subscribers: set[Subscriber] = set()
        self._lock = threading.Lock()
        self._sequence = itertools.count(1)

    def subscribe(self, user_id: int, manager: bool) -> Subscriber:
        subscriber = Subscriber(user_id=user_id, manager=manager, loop=asyncio.get_running_loop())
        with self._lock:
            self._subscribers.add(subscriber)
        return subscriber

    def unsubscribe(self, subscriber: Subscriber) -> None:
        with self._lock:
            self._subscribers.discard(subscriber)

    @property
    def count(self) -> int:
        with self._lock:
            return len(self._subscribers)

    def publish(self, kvar_id: int, action: str, reporter_id: int | None, internal: bool = False) -> None:
        """Safe from any thread (sync routes run in a thread pool). Call after the commit."""
        event = {"seq": next(self._sequence), "kvar_id": kvar_id, "akcija": action}
        with self._lock:
            targets = [s for s in self._subscribers if s.may_see(reporter_id, internal)]
        for subscriber in targets:
            try:
                subscriber.loop.call_soon_threadsafe(subscriber.offer, event)
            except RuntimeError:
                # The subscriber's loop has closed (server shutting down).
                self.unsubscribe(subscriber)


broker = Broker()


def publish_fault(kvar, action: str, internal: bool = False) -> None:
    """Announce a committed change to fault `kvar`. Never raises: live updates are best effort."""
    try:
        broker.publish(kvar.id, action, kvar.prijavio_id, internal)
    except Exception:
        logger.exception("Publishing a live update failed")


def format_event(name: str, data: dict) -> str:
    return f"event: {name}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"
