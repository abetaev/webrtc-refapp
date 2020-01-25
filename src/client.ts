import { invitationParam, rtcConfiguration } from './common'

import * as client from './client-lib'

const meetingServer = 'ws://localhost:8080/'

let link: HTMLAnchorElement

async function main() {

  let connection: client.Connection

  if (invitationParam) {

    connection = await client.accept({
      address: `${meetingServer}${invitationParam}`,
      invitation: invitationParam,
      configuration: rtcConfiguration
    })

  } else {
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