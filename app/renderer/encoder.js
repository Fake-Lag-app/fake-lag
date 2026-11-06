// JPEG encoding off the main thread, so the camera loop never waits on it.
let canvas = null, ctx = null;
onmessage = async e => {
  const bmp = e.data;
  if (!canvas || canvas.width !== bmp.width || canvas.height !== bmp.height) {
    canvas = new OffscreenCanvas(bmp.width, bmp.height); ctx = canvas.getContext('2d');
  }
  ctx.drawImage(bmp, 0, 0); bmp.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  const buf = await blob.arrayBuffer();
  postMessage(buf, [buf]);
};
