import * as client from './client-lib'

require('webrtc-adapter');

// config

export const rtcConfiguration: RTCConfiguration = {
  iceServers: [{
    urls: [
      'stun:127.0.0.1:3478', // coturn@localhost
      'stun:127.0.0.1:3479', // coturn@localhost
      'stun:stun.l.google.com:19302'
    ]
  }]
};

const meetingServer = 'ws://localhost:8080/'

export const tokenUrl = new URL(document.URL).searchParams.get("tokenUrl") || ""

async function main() {

  if (tokenUrl) {

    console.log(`${tokenUrl}`)

    const { peer, data } = await client.accept(
      tokenUrl,
      rtcConfiguration
    );

    const ctrl = data('ctrl');
    ctrl.onopen = () => ctrl.send('hello');

    (await peer).ondatachannel = ({ channel }) => {
      channel.onmessage = ({ data }) => console.log(data)
    }

  } else {

    console.log(`invite`)

    const { url, peer, data } = await client.invite(
      meetingServer,
      rtcConfiguration
    )

    const ctrl = data('ctrl')
    ctrl.onopen = () => {
      console.log(1)
      ctrl.send('hello')
    }

    const link = document.createElement('a')
    link.href = `./?tokenUrl=${url}`
    link.innerText = 'link'
    link.target = '_blank'
    document.body.appendChild(link);

    (await peer).ondatachannel = ({ channel }: RTCDataChannelEvent) => {
      console.log('data channel established')
      channel.onmessage = message => {
        console.log(message)
      }
    }

    document.body.removeChild(link)

  }

}

main()