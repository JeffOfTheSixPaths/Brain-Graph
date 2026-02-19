import asyncio

import websockets


connected: set[websockets.WebSocketServerProtocol] = set()


async def broadcast(message: str, *, exclude: websockets.WebSocketServerProtocol | None = None) -> None:
    if not connected:
        return
    targets = [client for client in list(connected) if client is not exclude]
    if not targets:
        return
    await asyncio.gather(
        *[client.send(message) for client in targets],
        return_exceptions=True,
    )


async def handler(websocket: websockets.WebSocketServerProtocol) -> None:
    connected.add(websocket)
    await broadcast("connect", exclude=websocket)
    try:
        async for _ in websocket:
            await broadcast("bump")
    finally:
        connected.discard(websocket)


async def main() -> None:
    async with websockets.serve(handler, "0.0.0.0", 8787):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
