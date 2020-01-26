export async function join(meetingServer: string):
  Promise<{
    socket: WebSocket,
    joinUrl: string
  }> {

  const socket = new WebSocket(meetingServer)

  const tokenPromise = new Promise<string>((resolve) => {
    socket.onmessage = async ({ data: invitation }: MessageEvent) => resolve(invitation)
  });

  const token = await tokenPromise

  return {
    socket,
    joinUrl: `${meetingServer}${token}`
  }

}

export async function accept(invitation: string): Promise<WebSocket> {
  const socket = new WebSocket(invitation);
  await new Promise(resolve => socket.onopen = () => resolve())
  return socket
}