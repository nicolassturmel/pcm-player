const WebSocket = require('ws');
const fs = require('fs');
var dgram = require('dgram'); 
var stats = require('./statistics')

var inter_packet_stats = new stats()
var delay_stats = new stats()
var rms = new stats()

let interval = 0.05,
    sampleRate = 48000,
    bytePerSample = 4,
    channels = 2,
    bytesChunk = (sampleRate * 0.05 * bytePerSample * channels),
    offset = 0,
    pcmData,
    wss,
    wss2;

  let buffer = [
    new Buffer.alloc(0.05*sampleRate* bytePerSample * channels),
    new Buffer.alloc(0.05*sampleRate* bytePerSample * channels)
  ]

  console.log(buffer)

  let currentBuffer = 0
  let currentPos = 0
  let tic = 0
  openSocket();


  let maxG = 0
  let minG = Number.POSITIVE_INFINITY

let timeOffset = 0n

function getPTP() {
  let madd = '224.0.1.129'
  let port = 319
  let host = "192.168.1.162"
  var client = dgram.createSocket({ type: "udp4", reuseAddr: true });

  client.on('listening', function () {
      console.log('UDP Client listening on ' + madd + ":" + port);
      client.setBroadcast(true)
      client.setMulticastTTL(128); 
      client.addMembership(madd,host);
  });



  client.on('message', function (message, remote) {
    let time = process.hrtime.bigint()
    if(message.readUInt8(0) == 0 && message.readUInt8(1) == 0x2) {
      let ts1 = message.readUInt8(34)
      let ts2 = message.readUInt8(35)
      let ts3 = message.readUInt8(36)
      let ts4 = message.readUInt8(37)
      let ts5 = message.readUInt8(38)
      let ts6 = message.readUInt8(39)
      let ns1 = message.readUInt8(40)
      let ns2 = message.readUInt8(41)
      let ns3 = message.readUInt8(42)
      let ns4 = message.readUInt8(43)
      let s = BigInt(ts1*Math.pow(2,48) + ts2*Math.pow(2,32) + ts3*Math.pow(2,24) + ts4*Math.pow(2,16) + ts5*Math.pow(2,8) + ts6)*1000000000n + BigInt(ns1*Math.pow(2,24) + ns2*Math.pow(2,16) + ns3*Math.pow(2,8) + ns4)
      console.log(" - " + s)
      timeOffset =  s - time
    }
  })


  client.bind(port);
}

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
  let lastTime = BigInt(0)
  let tc = 0
  let Tdiff = 0
  let max = 0
  let min = Number.POSITIVE_INFINITY

  client.on('message', function (message, remote) {   
      //console.log(".")
      let v = message.readInt8(0)
      let pt = message.readInt8(1)
      let seq = message.readUInt16BE(2)
      let ts = message.readUInt32BE(4)
      let ssrc = message.readUInt32BE(8)

      // inter packet time
      let time = process.hrtime.bigint()
      let diff = Number(time - lastTime)/1000000;
      lastTime = time

      // computing ts
      let realTime = timeOffset + time
      let realTS = Number(realTime*48000n / 1000000000n)%Math.pow(2,32)
      let tsdiff = (realTS - ts + Math.pow(2,32))%Math.pow(2,32)
      if(tsdiff > Math.pow(2,31)) tsdiff = tsdiff - Math.pow(2,32)
      inter_packet_stats.add(diff)
      delay_stats.add(tsdiff)

      if(currentPos == 0.05*sampleRate)
      {
        currentPos = 0
        currentBuffer = (currentBuffer+1)%2
        sendData({
          delay: delay_stats.get(),
          inter_packets: inter_packet_stats.get(),
          rms: 10*Math.log(rms.get().mean),
          rtp : {
            payload_type: pt,
            ssrc: ssrc
          },
          sender : {
            ip: remote.address,
            port: remote.port
          }
        })
      }


      if(seq != lastSeq+1)
        console.log("Err Seq: ",seq,lastSeq)
      lastSeq = seq
      if(lastSeq == 65535) lastSeq = -1

      for(let i = 0; i < 48; i++) 
      {
        //console.log(i)
        let s = Math.pow(2,28)*Math.sin(2*Math.PI*800*tic/sampleRate)
        let s1 = (message.readInt32BE(i*6+12 - 1) & 0x00FFFFFF) << 8
        let s2 = (message.readInt32BE(i*6+12 + 3 - 1) & 0x00FFFFFF) << 8
        rms.add((s1 / Math.pow(2,32))*(s1 / Math.pow(2,32)))
        buffer[currentBuffer].writeInt32LE(s1,bytePerSample * channels*currentPos)
        buffer[currentBuffer].writeInt32LE(s2,bytePerSample * channels*currentPos + bytePerSample)
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
  wss2 = new WebSocket.Server({ port: 8081 });
  console.log('Server ready...');
  wss2.on('connection', function connection(ws) {
        console.log('Socket connected. sending data...');
        ws.on('message',(m) => {
          let msg = JSON.parse(m)
          console.log(m,msg)
          if(msg.type == "clear") {
            inter_packet_stats.clear()
            delay_stats.clear()
          }
        })
  });
}

function sendData(struct) {
    let payload;
    console.log(struct)
    payload = buffer[currentPos]
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
      }
    });
    wss2.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(struct));
      }
    });
}

getRtp()
getPTP()
