export type DialogHandler = {
  onMessage: (receiver: (event: MessageEvent) => Promise<void>) => void,
  sendMessage: (message: any) => void
}

export async function join(meetingServer: string):
  Promise<{
    dialogHandler: DialogHandler,
    joinUrl: string
  }> {

  const socket = new WebSocket(meetingServer)

  const tokenPromise = new Promise<string>((resolve) => {
    socket.onmessage = async ({ data: invitation }: MessageEvent) => resolve(invitation)
  });

  const token = await tokenPromise

  return {
    dialogHandler: handler(socket),
    joinUrl: `${meetingServer}${token}`
  }

}

export async function accept(invitation: string): Promise<DialogHandler> {
  const socket = new WebSocket(invitation);
  await new Promise(resolve => socket.onopen = () => resolve())
  return handler(socket)
}

const handler = (socket: WebSocket): DialogHandler => ({
  onMessage: (receiver) => socket.onmessage = ({ data }) => receiver(JSON.parse(data)),
  sendMessage: (message) => socket.send(JSON.stringify(message))
})