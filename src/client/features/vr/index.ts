/**
 * VR: step into the office in a headset. A button shows up when the browser has WebXR; in VR the
 * headset owns where you look, and WASD still walks you — forward is wherever your head faces.
 *
 * The camera rides a rig group. In VR the headset drives the camera's own pose, so we carry the rig
 * under it to move you about; out of VR the rig sits at the origin and the camera is placed as before
 * (see aimCamera). Deliberately minimal: head-look and the keyboard, no controllers and no teleport —
 * see drawScene/watchFrameRate in core/loop.ts for the few places a frame steps aside while presenting.
 */
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import type { Ctx } from '../../core/context';
import './ui.css';

export function installVr(ctx: Ctx) {
  const { renderer, camera, scene, player } = ctx;
  renderer.xr.enabled = true;
  // The camera rides a rig: in VR the headset owns the camera's pose, and we move the rig to walk you.
  const rig = new THREE.Group();
  rig.name = 'vrRig';
  scene.add(rig);
  rig.add(camera);

  // Only add the button where a headset can actually be entered. Desktop browsers have navigator.xr
  // without one, where the stock button would sit disabled reading "VR NOT SUPPORTED".
  navigator.xr?.isSessionSupported('immersive-vr').then((ok) => {
    if (!ok) return;
    const button = VRButton.createButton(renderer);
    button.id = 'vrButton';
    document.body.appendChild(button);
  });

  // In first person you see out of your own head, not the back of it; snap there when the headset goes on.
  renderer.xr.addEventListener('sessionstart', () => player.setView('first'));
  // Back out of VR, the rig returns to the origin so the flat view is placed from the camera again, and
  // the canvas is re-sized to the window (the resize handler held off while the headset had the buffer).
  renderer.xr.addEventListener('sessionend', () => {
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    window.dispatchEvent(new Event('resize'));
  });

  const look = new THREE.Vector3();
  // After you've moved (aim runs past the move phase), carry the rig to your feet and take your heading
  // from where the headset looks, so "forward" on the keyboard is wherever you're facing in the headset.
  ctx.ticks.add('aim', () => {
    if (!renderer.xr.isPresenting) return;
    camera.getWorldDirection(look);
    if (look.x || look.z) player.camYaw = Math.atan2(-look.x, -look.z);
    rig.position.set(player.pos.x, player.pos.y, player.pos.z);
    rig.rotation.set(0, 0, 0);
  });
}
