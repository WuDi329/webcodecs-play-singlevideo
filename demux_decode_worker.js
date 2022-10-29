importScripts('./mp4box.all.min.js');
// importScripts('./mp4_demuxer.js');

let lastMediaTimeCapturePoint = 0;
let lastMediaTimeSecs = 0;
let moduleLoadedResolver = null;
let videoRenderer = null;
let frameCount = 0;
let playing = false;
let modulesReady = new Promise(resolver => (moduleLoadedResolver = resolver));




function updateMediaTime(mediaTimeSecs, capturedAtHighResTimestamp) {
  lastMediaTimeSecs = mediaTimeSecs;
  // Translate into Worker's time origin
  lastMediaTimeCapturePoint =
    capturedAtHighResTimestamp - performance.timeOrigin;
}

// Estimate current media time using last given time + offset from now()
function getMediaTimeMicroSeconds() {
  let msecsSinceCapture = performance.now() - lastMediaTimeCapturePoint;
  return ((lastMediaTimeSecs * 1000) + msecsSinceCapture) * 1000;
}




(async () => {
  let videoImport = import('./video_renderer.js');
  videoImport.then((vi) =>{
    videoRenderer = new vi.VideoRenderer();
    console.log(videoRenderer)
    moduleLoadedResolver();
    moduleLoadedResolver = null;
    console.log('worker imported')
  })
})();

self.addEventListener('message', async function(e) {
  await modulesReady;
  switch (e.data.command) {
    case 'initialize':

      let demuxer = await import('./mp4_demuxer.js');
      let videoDemuxer =  new demuxer.MP4PullDemuxer('./bbb_video_avc_frag.mp4');
      console.log(videoRenderer)
      let videoReady = videoRenderer.initialize(videoDemuxer, e.data.canvas);
      await videoReady;
      console.log("videorenderer initialize finished")
      console.log('initialize done');
      this.postMessage({command: 'initialize-done'})
      break;
    case 'play':
      playing = true;
      updateMediaTime(e.data.mediaTimeSecs,
                      e.data.mediaTimeCapturedAtHighResTimestamp);
      
      self.requestAnimationFrame(function renderVideo() {
      //如果playing是false，那么将会直接返回
        if (!playing)
          return;
          //根据getMediaTimeMicroSeconds()返回的时间，返回具体的frame
        videoRenderer.render(getMediaTimeMicroSeconds());
        self.requestAnimationFrame(renderVideo);
      });
      break;
    case 'pause':
      playing = false;
      break;
    case 'update-media-time':
      updateMediaTime(e.data.mediaTimeSecs,
                      e.data.mediaTimeCapturedAtHighResTimestamp);
      break;
    default:
      console.error(`Worker bad message: ${e.data}`);
  }


  


  //worker中无法创建MediaStreamTrackGenerator？
  // const generator = new MediaStreamTrackGenerator({type : 'video'});
  // const writer = generator.writable.getWriter();

  // function getFrameStats() {
  //     let now = performance.now();
  //     let fps = "";

  //     if (frameCount++) {
  //       let elapsed = now - startTime;
  //       fps = " (" + (1000.0 * frameCount / (elapsed)).toFixed(0) + " fps)"
  //     } else {
  //       // This is the first frame.
  //       startTime = now;
  //     }

  //     return "Extracted " + frameCount + " frames" + fps;
  // }

  // let decoder = new VideoDecoder({
  //   output : frame => {
  //     console.log(19999999)
  //     ctx.drawImage(frame, 0, 0, offscreen.width, offscreen.height);

  //     // Close ASAP.
  //     frame.close();

  //     // Draw some optional stats.
  //     ctx.font = '35px sans-serif';
  //     ctx.fillStyle = "#ffffff";
  //     ctx.fillText(getFrameStats(), 40, 40, offscreen.width);
  //   },
  //   error : e => console.error(e),
  // });

  // demuxer.getConfig().then((config) => {W
  //   offscreen.height = config.codedHeight;
  //   offscreen.width = config.codedWidth;

  //   decoder.configure(config);
  //   console.log(12321312312);
  //   demuxer.start((chunk) => { decoder.decode(chunk); })
  // });
})
