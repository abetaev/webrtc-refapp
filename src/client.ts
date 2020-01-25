import * as client from './client-lib'

require('webrtc-adapter');

// config

export const rtcConfiguration: RTCConfiguration = {
  iceServers: [{
    urls: [
      'stun:127.0.0.1:3478', // coturn@localhost
      'stun:127.0.0.1:3479', // coturn@localhost
      // 'stun:stun.l.google.com:19302'
    ]
  }]
};

const meetingServer = 'ws://localhost:8080/'

export const invitationParam = new URL(document.URL).searchParams.get("invitation") || ""

let link: HTMLAnchorElement

async function main() {

  let connection: client.Connection

  if (invitationParam) {

    console.log(`accept ${invitationParam}`)

    connection = await client.accept({
      address: `${meetingServer}${invitationParam}`,
      invitation: invitationParam,
      configuration: rtcConfiguration
    })

  } else {

    console.log(`invite`)

    const {
      meeting: invitation,
      connection: connection2
    } = await client.invite(meetingServer, rtcConfiguration)

    link = document.createElement('a')
    link.href = `./?invitation=${invitation.invitation}`
    link.innerText = 'link'
    link.target = '_blank'
    document.body.appendChild(link);

    connection = await connection2

    document.body.removeChild(link)

  }

  connection.ctrl.onmessage = ({data}) => {
    console.log(`message: ${JSON.stringify(data)}`)
  }

  connection.ctrl.send('hello')

}

main()