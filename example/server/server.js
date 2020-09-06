const WebSocket = require('ws');
const fs = require('fs');
var dgram = require('dgram'); 

const pcm_file = './16bit-8000.raw';
let interval = 0.05,
    sampleRate = 48000,
    bytePerSample = 4,
    channels = 2,
    bytesChunk = (sampleRate * 0.05 * bytePerSample * channels),
    offset = 0,
    pcmData,
    wss;

  let buffer = [
    new Buffer.alloc(0.05*sampleRate* bytePerSample * channels),
    new Buffer.alloc(0.05*sampleRate* bytePerSample * channels)
  ]

  console.log(buffer)

  let currentBuffer = 0
  let currentPos = 0
  let tic = 0
  openSocket();

function getRtp() {
  let madd = "239.2.1.134"
  let port = 5008
  let host = "192.168.1.162"
  var client = dgram.createSocket({ type: "udp4", reuseAddr: true });

  client.on('listening', function () {
      console.log('UDP Client listening on ' + madd + ":" + port);
      client.setBroadcast(true)
      client.setMulticastTTL(128); 
      client.addMembership(madd,host);
  });

  let lastSeq = 0
  let lastTime = 0
  let tc = 0
  let Tdiff = 0
  let max = 0
  let min = 0

  client.on('message', function (message, remote) {   
      //console.log(".")
      let time = Date.now()
      let diff = (time - lastTime);
      Tdiff += diff
      if(diff < min) min = diff
      if(diff > max) max = diff
      lastTime = time
      tc++

      if(currentPos == 0.05*sampleRate)
      {
        currentPos = 0
        currentBuffer = (currentBuffer+1)%2
        console.log(Tdiff/tc,min,max)
        min = 1000000000
        max = 0
        Tdiff=0
        tc=0
        sendData()
      }
      let v = message.readInt8(0)
      let pt = message.readInt8(1)
      let seq = message.readUInt16BE(2)
      let ts = message.readUInt32BE(4)
      let ssrc = message.readUInt32BE(8)

      if(seq != lastSeq+1)
        console.log("Err Seq: ",seq,lastSeq)
      lastSeq = seq
      if(lastSeq == 65535) lastSeq = -1

      for(let i = 0; i < 48; i++) 
      {
        //console.log(i)
        let s = Math.pow(2,28)*Math.sin(2*Math.PI*400*tic/sampleRate)
        let s1 = (message.readInt32BE(i*6+12 - 1) & 0x00FFFFFF) << 8
        let s2 = (message.readInt32BE(i*6+12 + 3 - 1) & 0x00FFFFFF) << 8
        buffer[currentBuffer].writeInt32LE(s1,bytePerSample * channels*currentPos)
        buffer[currentBuffer].writeInt32LE(s,bytePerSample * channels*currentPos + bytePerSample)
        currentPos += 1
        tic++
      }
  });

  client.bind(port);
}


function openSocket() {
  wss = new WebSocket.Server({ port: 8080 });
  console.log('Server ready...');
  wss.on('connection', function connection(ws) {
        console.log('Socket connected. sending data...');
        // interval = setInterval(function() {
        //   sendData();
        // }, 50);
  });
}

function sendData() {
    let payload;
    
    payload = buffer[currentPos]
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
      }
    });
}

getRtp()