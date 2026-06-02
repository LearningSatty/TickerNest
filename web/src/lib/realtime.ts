import { io, type Socket } from 'socket.io-client';

let sock: Socket | null = null;

export const connectRealtime = (userId: string): Socket => {
  if (sock) return sock;
  const url = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000';
  sock = io(url, {
    path: '/ws',
    transports: ['websocket'],
    auth: { userId, token: sessionStorage.getItem('tn:jwt') },
  });
  return sock;
};

export const disconnectRealtime = () => {
  sock?.disconnect();
  sock = null;
};
