import { h, JSX } from 'preact'
import 'preact-material-components/style.css'
import Card from 'preact-material-components/ts/Card'
import IconButton from 'preact-material-components/ts/IconButton'
import LayoutGrid from 'preact-material-components/ts/LayoutGrid'
import { useState } from 'preact/hooks'
import TelegramIcon from './icons/telegram.png'
import * as NETWORK from './network'
import { Meeting } from './network'
import NoImage from './no.png'
import uuid = require('uuid')


type PhoneCols = 1 | 2 | 3 | 4;
type TabletCols = PhoneCols | 5 | 6 | 7 | 8;
type LayoutCols = TabletCols | 9 | 10 | 11 | 12;

type VideoProps = {
  stream?: MediaStream,
  ref?: (ref: HTMLVideoElement) => void
} & JSX.HTMLAttributes<HTMLVideoElement>
const Video = ({ stream, ref, ...props }: VideoProps) => (
  <video
    autoPlay
    poster={NoImage}
    style={{
      display: 'block',
      width: '100%',
      height: '100%'
    }}
    ref={video => {
      if (video && stream) {
        video.srcObject = stream;
        video.load()
        ref && ref(video)
      }
    }}
    {...props} />
)

const Controls = () => (
  <IconButton>
    <IconButton.Icon>mute</IconButton.Icon>
  </IconButton>
)

const px = (px: number) => `${Math.floor(px)}px`
const gr = 1.61803398875

type LayoutProps = { meeting: Meeting }
const Layout = ({ meeting }: LayoutProps) => {
  const totalConversations = Object.keys(meeting.conversations).length;

  console.log(`totalConversations: ${totalConversations}`)

  const size1 = Math.ceil(Math.sqrt(totalConversations + 1));
  const size2 = Math.max(1, Math.ceil(totalConversations / size1));

  console.log(`size: ${size1}x${size2}`)

  const desktopCols = Math.min(6, Math.ceil(12 / size1)) as LayoutCols
  const desktopAlignCols = Math.ceil((12 - desktopCols) / 2) + 1 as LayoutCols

  const tabletCols = 3
  const tabletAlignCols = 3

  const phoneCols = 4
  const phoneAlignCols = 1

  const VideoCard = ({ stream }) => {
    return (
      <Card>
        <Video stream={stream} />
      </Card>
    )
  }

  return (
    <LayoutGrid>
      <LayoutGrid.Inner >
        {Object.values(meeting.conversations).map(({ stream }) => (
          <LayoutGrid.Cell
            desktopCols={desktopCols}
            tabletCols={tabletCols}
            phoneCols={phoneCols}
            align="middle">
            <VideoCard stream={stream} />
          </LayoutGrid.Cell>
        ))}
        {totalConversations % 2 === 0 ?
          <LayoutGrid.Cell
            desktopCols={desktopAlignCols}
            tabletCols={tabletAlignCols}
            phoneCols={phoneAlignCols} /> : null}
        <LayoutGrid.Cell align="bottom" cols={1}>
          <IconButton onClick={() => copy(meeting)}>
            <IconButton.Icon>link</IconButton.Icon>
          </IconButton>
          <IconButton onClick={() => email(meeting)}>
            <IconButton.Icon>alternate_email</IconButton.Icon>
          </IconButton>
          <IconButton onClick={() => telegram(meeting)}>
            <img src={TelegramIcon} style={{ height: '100%' }} />
          </IconButton>
        </LayoutGrid.Cell>
        <LayoutGrid.Cell align="bottom" cols={2}>
          <Card>
            <Video stream={meeting.stream} />
          </Card>
        </LayoutGrid.Cell>
      </LayoutGrid.Inner>
    </LayoutGrid>
  )
}

let beaconServer = `wss://${(new URL(document.URL)).host}/`

const sendTo = (meeting: Meeting, handler: (peer: string) => void) => {
  NETWORK.issueInvitation(
    meeting,
    url => {
      const documentURL = new URL(document.URL)
      handler(`${documentURL.protocol}//${documentURL.host}/?join=${encodeURI(url.toString())}`)
    }
  )
}
function telegram(meeting: Meeting) {
  sendTo(
    meeting,
    (url) => window.open(`https://telegram.me/share/url?url=${encodeURI(url)}`)
  )
}
function email(meeting: Meeting) {
  sendTo(
    meeting,
    (url) => window.open(`mailto:?body=${encodeURI(url)}`)
  )
}

function copy(meeting: Meeting) {
  sendTo(
    meeting,
    async (url) => {
      try {
        await navigator.clipboard.writeText(url.toString())
        alert('link copied to clipboar')
      } catch (error) {
        alert(`failed to copy link: ${error}`)
      }
    }
  )
}

export default () => {

  const [{ meeting, version }, update] = useState<{ meeting: Meeting, version: number }>({
    meeting: {
      network: {
        id: uuid(),
        peers: []
      },
      beaconServer,
      conversations: {},
      on: () => update({ meeting, version: version + 1 }),
      stream: null
    },
    version: 0
  })

  if (meeting.stream === null) {
    (async () => {
      let audio = false;
      let video = false;
      (await navigator.mediaDevices.enumerateDevices()).forEach(({ kind }) => {
        if (kind === "videoinput") { video = true }
        else if (kind === "audioinput") { audio = true }
      });

      if (!audio) {
        throw new Error("audio device is not available")
      }
      if (!video) {
        console.log("video device is not available")
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio, video })
      meeting.stream = stream

      const invitation = new URL(document.URL).searchParams.get('join')
      invitation && NETWORK.acceptInvitation(meeting, invitation)
        .catch(error => alert(`failed to accept invitation: ${error.toString()}`))
      update({ meeting, version: version + 1 })
    })()
  }

  return <Layout meeting={meeting} />;
}
