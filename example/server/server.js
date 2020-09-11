const WebSocket = require('ws');
const fs = require('fs');
var dgram = require('dgram'); 
var stats = require('./statistics')
const { Worker } = require('worker_threads')

const worker = new Worker("./rtp-worker.js")
worker.on('online', () => { 
  worker.postMessage({
    type: "start",
    data: {
      maddress: "239.1.1.135",
      host: "192.168.1.162",
      port: 5008,
      codec: "L24",
      channels: 2,
      buuferLength: 0.05,
    }
  })
  console.log('Launching intensive CPU task') 
})
worker.on('message',(k) => {
  switch(k.type) {
    case "data":
      sendData(k.data)
      break
    default:
      break
  }
})
var inter_packet_stats = new stats()
var delay_stats = new stats()
var rms = [new stats(), new stats()]

let interval = 0.05,
    sampleRate = 48000,
    bytePerSample = 4,
    bytePerSampleStream = 3,
    channels = 2,
    wss,
    wss2;

  let buffer = [
    new Buffer.alloc(interval*sampleRate* bytePerSample * channels),
    new Buffer.alloc(interval*sampleRate* bytePerSample * channels)
  ]

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
      worker.postMessage({type: "timeOffset", data: timeOffset})
    }
  })


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
            worker.postMessage({type: "clear"})
          }
        })
  });
}

function sendData(struct) {
    let payload;
    //console.log(struct)
    payload = buffer[currentBuffer]
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
          client.send(struct.buffer);
      }
    });
    struct.buffer = null
    wss2.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(struct));
      }
    });
}

getPTP()
