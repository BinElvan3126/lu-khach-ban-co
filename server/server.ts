import { handlePlayerSocket } from './player.ts';

const port = Number(Deno.env.get('PORT') ?? 8787);

Deno.serve({ port }, (request) => {
  const url = new URL(request.url);

  if (url.pathname === '/health') {
    return Response.json({ ok: true, service: 'lu-khach-ban-co-server' });
  }

  if (url.pathname === '/ws') {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    const { socket, response } = Deno.upgradeWebSocket(request);
    handlePlayerSocket(socket);
    return response;
  }

  return new Response('Lu Khach Ban Co multiplayer server', {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
});
