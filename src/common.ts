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

// page parameters

export const invitationParam = new URL(document.URL).searchParams.get("invitation") || ""

if (invitationParam) {
  console.log(`joining ${invitationParam}`)
} else {
  console.log(`creating meeting`)
}
