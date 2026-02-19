import asyncio

import websockets


async def main() -> None:
    async with websockets.connect("ws://localhost:8787") as ws:
        await ws.send("bump")


if __name__ == "__main__":
    asyncio.run(main())
