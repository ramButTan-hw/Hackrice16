exports.captureScreen = async function ({permissions,screen,desktopCapturer}) {
  await permissions.ensure('screen');
  const display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:1280,height:1280}});
  // Some native backends omit display_id; only fall back when there is one screen.
  const source=sources.find(s=>s.display_id===String(display.id))||(sources.length===1?sources[0]:null);
  if(!source||source.thumbnail.isEmpty())throw new Error('Could not capture the display under your cursor. Move the cursor onto the screen you want to share and try again.');
  return source.thumbnail.toJPEG(70).toString('base64');
};
