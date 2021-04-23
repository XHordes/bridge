#!/usr/bin/env node

const http = require("http");
const fs = require("fs")
const JSZip = require("jszip");
const WebSocket = require("ws");
const chokidar = require('chokidar');

if (!fs.existsSync("manifest.json")) throw new Error("There is no manifest.json file in this directory!")
var meta = JSON.parse(fs.readFileSync("manifest.json", "utf8"))

//start the ws server
var socket //the variable that the rest of the code will use to send messages to the extension
const server = http.createServer()
const wss = new WebSocket.Server({server})

wss.on("connection", (ws)=>{
    ws.on("message", (m)=>{
        let data = JSON.parse(m)
        switch (data.type) {
            case "ready":
                socket = ws
                console.log("XHordes extension has connected!")
                break;
            case "installed":
                console.log("Successfully updated mod.")
                break;
        }
    })
})

server.listen(3001)

//figure out what files need to be watched
let files = []
if (meta.js) files.push(meta.js)
if (meta.css) files.push(meta.css)
if (meta.icon) files.push(meta.icon)

function watch() {
    //stare intently at the files
    for (let file of files) {
        // fs.watch(file, ()=>update(file))
        chokidar.watch(file).on("change", ()=>{
            update(file)
        })
    }
}

//unwatch all files and update meta object in case they changed a file name for some reason or added a file or something idk
async function reset() {
    for (let file of files) {
        fs.unwatchFile(file)
    }
    meta = JSON.parse(fs.readFileSync("manifest.json", "utf8"))
    files = []
    if (meta.js) files.push(meta.js)
    if (meta.css) files.push(meta.css)
    if (meta.icon) files.push(meta.icon)
    await build()
    watch()
}

//idk zip everyhing or something
async function build() {
    //remove any previous build folders
    if (fs.existsSync("build.zip")) fs.rmSync("build.zip")

    let zip = new JSZip()
    zip.file("manifest.json", fs.readFileSync("manifest.json"))
    if (meta.js) zip.file(meta.js, fs.readFileSync(meta.js))
    if (meta.css) zip.file(meta.css, fs.readFileSync(meta.css))
    if (meta.icon) zip.file(meta.icon, fs.readFileSync(meta.icon))
    fs.writeFileSync("build.zip", await zip.generateAsync({type:"nodebuffer"}))
}

async function update(file) {
    //only update the file in the zip that we need to and then tell the extension about it
    console.log("Detected change in "+file+", rezipping...")
    let zip = new JSZip()
    await zip.loadAsync(fs.readFileSync("build.zip"))
    zip.file(file, fs.readFileSync(file))
    fs.writeFileSync("build.zip", await zip.generateAsync({type:"nodebuffer"}))

    if (typeof socket !== "undefined") {
        //tell xhordes to download the new mod
        socket.send(JSON.stringify({
            type:"update"
        }))
    }
    else {
        console.log("An XHordes extension hasn't connected yet! (Make sure you've gone into the dev tab and hit the \"Listen\" button!)")
    }
}

fs.watch("manifest.json", "utf8", reset) //don't need to add multiple listeners to this file so we'll leave it outside of the watch function
build() //zip up everything for the first time. Every other file update will be done inside the zip file (which is theoretically faster than zipping from scatch every time)
watch()