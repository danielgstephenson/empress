const path = require('path')
const express = require('express')
const config = require('./config.json')
const fs = require('fs')
const http = require('http')
const https = require('https')
const socketIo = require('socket.io')
const csvtojson = require('csvtojson')
const app = express()
const options = {}
if (config.secure) {
  options.key = fs.readFileSync('sis-key.pem')
  options.cert = fs.readFileSync('sis-cert.pem')
}
const server = config.secure ? https.createServer(options, app) : http.Server(app)
const io = config.secure ? socketIo(server, options) : socketIo(server)

app.use(express.static(path.join(__dirname, 'public')))
const state = []
let events = {}
let layers = []
const seed = Math.random().toString()
console.log('seed = ' + seed)

app.get('/', (request, response) =>
  response.sendFile(path.join(__dirname, 'public', 'client.html'))
)

io.on('connection', async socket => {
  const plots = await csvtojson().fromFile('plots.csv')
  console.log('socket.id =', socket.id)
  socket.emit('setup', { seed, state, layers, plots })
  socket.on('updateServer', msg => {
    if (msg.seed === seed) {
      msg.updates.forEach(update => {
        state[update.id] = update
        events[update.id] = { socket, update }
        layers = msg.layers
      })
    }
  })
})

async function updateClients () {
  const values = Object.values(events)
  if (values.length === 0) return
  const sockets = await io.fetchSockets()
  sockets.forEach(socket => {
    const updates = values
      .filter(event => event.socket !== socket)
      .map(event => event.update)
    const msg = { seed, layers, updates }
    socket.emit('updateClient', msg)
  })
  events = {}
}

server.listen(3000, () => {
  const port = server.address().port
  console.log(`listening on port: ${port}`)
})

setInterval(updateClients, 100)
