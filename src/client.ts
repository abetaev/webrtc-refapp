import * as NETWORK from './network';
import { Meeting } from './network';
import uuid = require('uuid');
require('webrtc-adapter');

// jquery??!
const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T
const $$ = <T extends HTMLElement>(selector: string) => document.querySelectorAll(selector) as NodeListOf<T>

let meetingServer = `wss://${(new URL(document.URL)).host}/`

// config

let meeting: Meeting = null

const createMeeting = (
  stream: MediaStream,
): Meeting => ({
  stream,
  conversations: {},
  meetingServer,
  network: {
    id: uuid(),
    peers: []
  },
  on: (type, peer) => {
    console.log(`>>> ${peer} ${type}`)
    if (type === 'connect') {
      addConversation(peer, meeting.conversations[peer].stream)
    } else if (type === 'disconnect') {
      deleteConversation(peer)
    }
  }
})

const accept = (
  stream: MediaStream,
  invitation: string,
) => {
  if (!meeting) {
    meeting = createMeeting(stream);
  }
  NETWORK.acceptInvitation(meeting, invitation);
}


Object.assign(window, {
  join: (
    stream: MediaStream,
    sendInvite: (inviteUrl: URL) => void, /* convention: as long as it's
                                             possible transport object
                                             in deserialized view. */
  ) => {
    if (!meeting) {
      meeting = createMeeting(stream)
    }
    NETWORK.issueInvitation(meeting, sendInvite);
  }
});

function addConversation(peer: string, stream: MediaStream) {
  console.log('displaying incomming video')
  if (document.getElementById(peer)) {
    console.log('stream is already playing')
    return;
  }
  const video = Object.assign(document.createElement("video"), {
    id: peer,
    autoplay: true,
    srcObject: stream,
    poster: 'no.png'
  })

  video.load()
  $("main").appendChild(video)
  resize();
}

function deleteConversation(peer: string) {
  $("main").removeChild($(`main > video[id='${peer}']`))
  resize();
}

const resize = (() => {
  const orientations = { "landscape": "portrait", "portrait": "landscape" }
  const dicts = {
    "portrait": {
      "containerSizeName": "clientWidth",
      "videoSizeName": "videoWidth",
      "sizeName": "width"
    },
    "landscape": {
      "containerSizeName": "clientHeight",
      "videoSizeName": "videoHeight",
      "sizeName": "height"
    }
  }
  return () => {
    const container = $("main")

    const currentOrientation =
      container.clientHeight > container.clientWidth ?
        "portrait" :
        "landscape";

    const oppositeOrientation = orientations[currentOrientation];
    const { sizeName: sizeNameCurrent,
      containerSizeName: containerSizeNameCurrent,
      videoSizeName: videoSizeNameCurrent }
      = dicts[currentOrientation]
    const { sizeName: sizeNameOpposite,
      containerSizeName: containerSizeNameOpposite,
      videoSizeName: videoSizeNameOpposite }
      = dicts[oppositeOrientation]
    const containerCurrentSize = container[containerSizeNameCurrent]
    const containerOppositeSize = container[containerSizeNameOpposite] as unknown as number

    $$<HTMLVideoElement>("main > video").forEach(node => {
      let aspectRatio = node[videoSizeNameOpposite] / node[videoSizeNameCurrent]
      if (Number.isNaN(aspectRatio)) {
        aspectRatio = containerOppositeSize / containerCurrentSize
      }
      node[sizeNameCurrent] = containerCurrentSize
      node[sizeNameOpposite] = Math.floor(containerCurrentSize * aspectRatio);
    });
    $<HTMLElement>("main").classList.remove(oppositeOrientation);
    $<HTMLElement>("main").classList.add(currentOrientation);

    const asideVideo = $<HTMLVideoElement>("aside > video")
    let aspectRatio = asideVideo[videoSizeNameOpposite] / asideVideo[videoSizeNameCurrent]
    if (Number.isNaN(aspectRatio)) {
      aspectRatio = containerOppositeSize / containerCurrentSize
    }
    asideVideo[sizeNameCurrent] = Math.floor(containerCurrentSize * .20);
    asideVideo[sizeNameOpposite] = asideVideo[sizeNameCurrent] * aspectRatio;

  }
})();

(async function main() {

  let audio = false;
  let video = false;
  (await navigator.mediaDevices.enumerateDevices()).forEach(({ kind }) => {
    if (kind === "videoinput") { video = true }
    else if (kind === "audioinput") { audio = true }
  });

  if (!audio) {
    throw new Error("audio device is not available")
  }

  const localStream = await navigator.mediaDevices.getUserMedia({ video, audio })

  const videoElement = Object.assign(document.createElement("video"), {
    muted: true,
    autoplay: true,
    srcObject: localStream,
  });
  videoElement.load();
  $("aside").appendChild(videoElement);

  const joinUrl = new URL(document.URL).searchParams.get("join")
  if (joinUrl) {
    accept(
      localStream,
      joinUrl
    )
  }

  window.onresize = resize;

  const scheduleResize = (interval: number) => setTimeout(() => {
    resize();
    scheduleResize(interval);
  }, interval)

  scheduleResize(100);

})();