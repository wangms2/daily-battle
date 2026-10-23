// Vendored from Pokémon Showdown's client, battle-animations.ts at 0de26d2
// (see scripts/anims.ts). License: MIT.
// @ts-nocheck
/* eslint-disable */
/*
Most of this file is: CC0 (public domain)
  <http://creativecommons.org/publicdomain/zero/1.0/>

This license DOES extend to all images in the fx/ folder, with the exception of icicle.png, lightning.png, and bone.png.

icicle.png and lightning.png by Clint Bellanger are triple-licensed GPLv2/GPLv3/CC-BY-SA-3.0.
  <http://opengameart.org/content/icicle-spell>
  <http://opengameart.org/content/lightning-shock-spell>

rocks.png, rock1.png, rock2.png by PO user "Gilad" is licensed GPLv3.
*/

import type { AnimTable } from './types';

export const BattleOtherAnims: AnimTable = {
  hitmark: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'hitmark',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 1,
        },
        {
          opacity: 0.5,
          time: 250,
        },
        'linear',
        'fade',
      );
    },
  },
  attack: {
    anim(scene, [attacker, defender]) {
      scene.showEffect(
        'wisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.1,
          opacity: 1,
        },
        {
          x: defender.x,
          y: defender.y,
          z: defender.behind(40),
          scale: 1,
          opacity: 0.5,
        },
        'linear',
      );
    },
  },
  contactattack: {
    anim(scene, [attacker, defender]) {
      attacker.anim(
        {
          x: defender.x,
          y: defender.y + 80,
          z: defender.behind(-30),
          time: 400,
        },
        'ballistic',
      );
      attacker.anim({
        x: defender.x,
        y: defender.y + 5,
        z: defender.z,
        time: 100,
      });
      attacker.anim(
        {
          time: 500,
        },
        'ballistic2Back',
      );
      defender.delay(450);
      defender.anim(
        {
          z: defender.behind(20),
          time: 100,
        },
        'swing',
      );
      defender.anim(
        {
          time: 300,
        },
        'swing',
      );
      scene.wait(500);
    },
  },
  xattack: {
    anim(scene, [attacker, defender]) {
      scene.showEffect(
        'wisp',
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          scale: 0,
          opacity: 1,
          time: 400,
        },
        {
          x: defender.leftof(-20),
          y: defender.y,
          z: defender.behind(20),
          scale: 3,
          opacity: 0,
          time: 700,
        },
        'linear',
      );
      scene.showEffect(
        'wisp',
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          scale: 0,
          opacity: 1,
          time: 700,
        },
        {
          x: defender.leftof(-20),
          y: defender.y,
          z: defender.behind(20),
          scale: 3,
          opacity: 0,
          time: 1000,
        },
        'linear',
      );
      defender.delay(480);
      defender.anim(
        {
          z: defender.behind(20),
          time: 100,
        },
        'swing',
      );
      defender.anim(
        {
          time: 200,
        },
        'swing',
      );
      defender.anim(
        {
          z: defender.behind(20),
          time: 100,
        },
        'swing',
      );
      defender.anim(
        {
          time: 300,
        },
        'swing',
      );
      attacker.anim(
        {
          x: defender.leftof(-30),
          y: defender.y + 80,
          z: defender.behind(-30),
          time: 400,
        },
        'ballistic',
      );
      attacker.anim({
        x: defender.leftof(30),
        y: defender.y + 5,
        z: defender.z,
        time: 100,
      });
      attacker.anim(
        {
          x: defender.leftof(30),
          y: defender.y + 80,
          z: defender.behind(-30),
          time: 200,
        },
        'ballisticUp',
      );
      attacker.anim({
        x: defender.leftof(-30),
        y: defender.y + 5,
        z: defender.z,
        time: 100,
      });
      attacker.anim(
        {
          time: 500,
        },
        'ballistic2Back',
      );
    },
  },
  slashattack: {
    anim(scene, [attacker, defender]) {
      attacker.anim(
        {
          x: defender.x,
          y: defender.y + 80,
          z: defender.behind(-30),
          time: 400,
        },
        'ballistic',
      );
      attacker.anim({
        x: defender.x,
        y: defender.y + 5,
        z: defender.z,
        time: 100,
      });
      attacker.anim(
        {
          time: 500,
        },
        'ballistic2Back',
      );
      defender.delay(450);
      defender.anim(
        {
          z: defender.behind(20),
          time: 100,
        },
        'swing',
      );
      defender.anim(
        {
          time: 300,
        },
        'swing',
      );

      scene.showEffect(
        'rightslash',
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          scale: 1,
          opacity: 1,
          time: 500,
        },
        {
          scale: 3,
          opacity: 0,
          time: 800,
        },
        'linear',
        'fade',
      );
    },
  },
  clawattack: {
    anim(scene, [attacker, defender]) {
      attacker.anim(
        {
          x: defender.leftof(-30),
          y: defender.y + 80,
          z: defender.behind(-30),
          time: 400,
        },
        'ballistic',
      );
      attacker.anim({
        x: defender.leftof(30),
        y: defender.y + 5,
        z: defender.z,
        time: 100,
      });
      attacker.anim(
        {
          x: defender.leftof(30),
          y: defender.y + 80,
          z: defender.behind(-30),
          time: 200,
        },
        'ballisticUp',
      );
      attacker.anim({
        x: defender.leftof(-30),
        y: defender.y + 5,
        z: defender.z,
        time: 100,
      });
      attacker.anim(
        {
          time: 500,
        },
        'ballistic2Back',
      );
      defender.delay(450);
      defender.anim(
        {
          z: defender.behind(20),
          time: 100,
        },
        'swing',
      );
      defender.anim(
        {
          time: 200,
        },
        'swing',
      );
      defender.anim(
        {
          z: defender.behind(20),
          time: 100,
        },
        'swing',
      );
      defender.anim(
        {
          time: 300,
        },
        'swing',
      );

      scene.showEffect(
        'leftclaw',
        {
          x: defender.x - 20,
          y: defender.y + 20,
          z: defender.z,
          scale: 0,
          opacity: 1,
          time: 400,
        },
        {
          x: defender.x - 20,
          y: defender.y + 20,
          z: defender.z,
          scale: 3,
          opacity: 0,
          time: 700,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'leftclaw',
        {
          x: defender.x - 20,
          y: defender.y - 20,
          z: defender.z,
          scale: 0,
          opacity: 1,
          time: 400,
        },
        {
          x: defender.x - 20,
          y: defender.y - 20,
          z: defender.z,
          scale: 3,
          opacity: 0,
          time: 700,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'rightclaw',
        {
          x: defender.x + 20,
          y: defender.y + 20,
          z: defender.z,
          scale: 0,
          opacity: 1,
          time: 700,
        },
        {
          x: defender.x + 20,
          y: defender.y + 20,
          z: defender.z,
          scale: 3,
          opacity: 0,
          time: 1000,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'rightclaw',
        {
          x: defender.x + 20,
          y: defender.y - 20,
          z: defender.z,
          scale: 0,
          opacity: 1,
          time: 700,
        },
        {
          x: defender.x + 20,
          y: defender.y - 20,
          z: defender.z,
          scale: 3,
          opacity: 0,
          time: 1000,
        },
        'linear',
        'fade',
      );
    },
  },
  punchattack: {
    anim(scene, [attacker, defender]) {
      scene.showEffect(
        'wisp',
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          scale: 0,
          opacity: 1,
          time: 400,
        },
        {
          x: defender.leftof(-20),
          y: defender.y,
          z: defender.behind(20),
          scale: 3,
          opacity: 0,
          time: 700,
        },
        'linear',
      );
      scene.showEffect(
        'wisp',
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          scale: 0,
          opacity: 1,
          time: 500,
        },
        {
          x: defender.leftof(-20),
          y: defender.y,
          z: defender.behind(20),
          scale: 3,
          opacity: 0,
          time: 800,
        },
        'linear',
      );
      scene.showEffect(
        'fist',
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          scale: 1,
          opacity: 1,
          time: 400,
        },
        {
          x: defender.leftof(-20),
          y: defender.y,
          z: defender.behind(20),
          scale: 2,
          opacity: 0,
          time: 800,
        },
        'linear',
      );
      attacker.anim(
        {
          x: defender.leftof(20),
          y: defender.y,
          z: defender.behind(-20),
          time: 400,
        },
        'ballistic2Under',
      );
      attacker.anim({
        x: defender.x,
        y: defender.y,
        z: defender.z,
        time: 50,
      });
      attacker.anim(
        {
          time: 500,
        },
        'ballistic2',
      );
      defender.delay(425);
      defender.anim(
        {
          x: defender.leftof(-15),
          y: defender.y,
          z: defender.behind(15),
          time: 50,
        },
        'swing',
      );
      defender.anim(
        {
          time: 300,
        },
        'swing',
      );
    },
  },
  bite: {
    anim(scene, [attacker, defender]) {
      scene.showEffect(
        'topbite',
        {
          x: defender.x,
          y: defender.y + 50,
          z: defender.z,
          scale: 0.5,
          opacity: 0,
          time: 370,
        },
        {
          x: defender.x,
          y: defender.y + 10,
          z: defender.z,
          scale: 0.5,
          opacity: 1,
          time: 500,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'bottombite',
        {
          x: defender.x,
          y: defender.y - 50,
          z: defender.z,
          scale: 0.5,
          opacity: 0,
          time: 370,
        },
        {
          x: defender.x,
          y: defender.y - 10,
          z: defender.z,
          scale: 0.5,
          opacity: 1,
          time: 500,
        },
        'linear',
        'fade',
      );
    },
  },
  kick: {
    anim(scene, [attacker, defender]) {
      scene.showEffect(
        'foot',
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          scale: 1,
          opacity: 1,
          time: 400,
        },
        {
          x: defender.x,
          y: defender.y - 20,
          z: defender.behind(15),
          scale: 2,
          opacity: 0,
          time: 800,
        },
        'linear',
      );
    },
  },
  fastattack: {
    anim(scene, [attacker, defender]) {
      scene.showEffect(
        'wisp',
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          scale: 0,
          opacity: 0.5,
          time: 260,
        },
        {
          scale: 2,
          opacity: 0,
          time: 560,
        },
        'linear',
      );
      scene.showEffect(
        'wisp',
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          scale: 0,
          opacity: 0.5,
          time: 310,
        },
        {
          scale: 2,
          opacity: 0,
          time: 610,
        },
        'linear',
      );
      scene.showEffect(
        attacker.sp,
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          opacity: 0.3,
          time: 50,
        },
        {
          x: defender.x,
          y: defender.y,
          z: defender.behind(70),
          time: 350,
        },
        'accel',
        'fade',
      );
      scene.showEffect(
        attacker.sp,
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          opacity: 0.3,
          time: 100,
        },
        {
          x: defender.x,
          y: defender.y,
          z: defender.behind(70),
          time: 400,
        },
        'accel',
        'fade',
      );
      attacker.anim(
        {
          x: defender.x,
          y: defender.y,
          z: defender.behind(70),
          time: 300,
          opacity: 0.5,
        },
        'accel',
      );
      attacker.anim(
        {
          x: defender.x,
          y: defender.x,
          z: defender.behind(100),
          opacity: 0,
          time: 100,
        },
        'linear',
      );
      attacker.anim(
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.behind(70),
          opacity: 0,
          time: 1,
        },
        'linear',
      );
      attacker.anim(
        {
          opacity: 1,
          time: 500,
        },
        'decel',
      );
      defender.delay(260);
      defender.anim(
        {
          z: defender.behind(30),
          time: 100,
        },
        'swing',
      );
      defender.anim(
        {
          time: 300,
        },
        'swing',
      );
    },
  },
  fastanimattack: {
    anim(scene, [attacker, defender]) {
      attacker.anim(
        {
          z: attacker.behind(-70),
          time: 50,
          opacity: 1,
        },
        'decel',
      );
      attacker.anim(
        {
          opacity: 1,
          time: 150,
        },
        'accel',
      );
      defender.anim(
        {
          z: defender.behind(30),
          time: 70,
        },
        'decel',
      );
      defender.anim(
        {
          time: 170,
        },
        'accel',
      );
    },
  },
  fastanimspecial: {
    anim(scene, [attacker, defender]) {
      scene.showEffect(
        'shadowball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.8,
          time: 0,
        },
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          time: 100,
        },
        'decel',
      );
      scene.showEffect(
        'shadowball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.8,
          time: 70,
        },
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          time: 170,
        },
        'decel',
      );
      defender.anim(
        {
          z: defender.behind(30),
          time: 70,
        },
        'decel',
      );
      defender.anim(
        {
          time: 170,
        },
        'accel',
      );
    },
  },
  fastanimself: {
    anim(scene, [attacker, defender]) {
      attacker.anim(
        {
          scale: 1.5,
          time: 50,
        },
        'decel',
      );
      attacker.anim(
        {
          time: 170,
        },
        'accel',
      );
    },
  },
  sneakattack: {
    anim(scene, [attacker, defender]) {
      attacker.anim(
        {
          x: attacker.leftof(-20),
          y: attacker.y,
          z: attacker.behind(-20),
          opacity: 0,
          time: 200,
        },
        'linear',
      );
      attacker.anim(
        {
          x: defender.x,
          y: defender.y,
          z: defender.behind(-120),
          opacity: 0,
          time: 1,
        },
        'linear',
      );
      attacker.anim(
        {
          x: defender.x,
          y: defender.y,
          z: defender.behind(40),
          opacity: 1,
          time: 250,
        },
        'linear',
      );
      attacker.anim(
        {
          x: defender.x,
          y: defender.y,
          z: defender.behind(-5),
          opacity: 0,
          time: 300,
        },
        'linear',
      );
      attacker.anim(
        {
          opacity: 0,
          time: 1,
        },
        'linear',
      );
      attacker.anim(
        {
          time: 300,
          opacity: 1,
        },
        'linear',
      );
      defender.delay(330);
      defender.anim(
        {
          z: defender.behind(20),
          time: 100,
        },
        'swing',
      );
      defender.anim(
        {
          time: 300,
        },
        'swing',
      );
    },
  },
  spinattack: {
    anim(scene, [attacker, defender]) {
      attacker.anim(
        {
          x: defender.x,
          y: defender.y + 60,
          z: defender.behind(-30),
          time: 400,
        },
        'ballistic2',
      );
      attacker.anim({
        x: defender.x,
        y: defender.y + 5,
        z: defender.z,
        time: 100,
      });
      attacker.anim(
        {
          time: 500,
        },
        'ballistic2',
      );
      defender.delay(450);
      defender.anim(
        {
          z: defender.behind(20),
          time: 100,
        },
        'swing',
      );
      defender.anim(
        {
          time: 300,
        },
        'swing',
      );
      scene.wait(500);
    },
  },
  bound: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'iceball',
        {
          x: attacker.x,
          y: attacker.y + 15,
          z: attacker.z,
          scale: 0.7,
          xscale: 2,
          opacity: 0.3,
          time: 0,
        },
        {
          scale: 0.4,
          xscale: 1,
          opacity: 0.1,
          time: 500,
        },
        'decel',
        'fade',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.x,
          y: attacker.y - 5,
          z: attacker.z,
          scale: 0.7,
          xscale: 2,
          opacity: 0.3,
          time: 50,
        },
        {
          scale: 0.4,
          xscale: 1,
          opacity: 0.1,
          time: 550,
        },
        'decel',
        'fade',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.x,
          y: attacker.y - 20,
          z: attacker.z,
          scale: 0.7,
          xscale: 2,
          opacity: 0.3,
          time: 100,
        },
        {
          scale: 0.4,
          xscale: 1,
          opacity: 0.1,
          time: 600,
        },
        'decel',
        'fade',
      );
      attacker.anim(
        {
          y: attacker.y + 15,
          z: attacker.behind(10),
          yscale: 1.3,
          time: 200,
        },
        'swing',
      );
      attacker.anim(
        {
          time: 200,
        },
        'swing',
      );
      attacker.delay(25);
      attacker.anim(
        {
          x: attacker.leftof(-10),
          y: attacker.y + 15,
          z: attacker.behind(5),
          yscale: 1.3,
          time: 200,
        },
        'swing',
      );
      attacker.anim(
        {
          time: 200,
        },
        'swing',
      );
    },
  },
  selfstatus: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'wisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 2,
          opacity: 0.2,
          time: 0,
        },
        {
          scale: 0,
          opacity: 1,
          time: 300,
        },
        'linear',
      );
      scene.showEffect(
        'wisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 2,
          opacity: 0.2,
          time: 200,
        },
        {
          scale: 0,
          opacity: 1,
          time: 500,
        },
        'linear',
      );
    },
  },
  lightstatus: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'electroball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 2,
          opacity: 0.1,
          time: 0,
        },
        {
          scale: 0,
          opacity: 0.5,
          time: 600,
        },
        'linear',
      );
    },
  },
  chargestatus: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'electroball',
        {
          x: attacker.x - 60,
          y: attacker.y + 40,
          z: attacker.z,
          scale: 0.7,
          opacity: 0.7,
          time: 0,
        },
        {
          x: attacker.x,
          y: attacker.y,
          scale: 0.2,
          opacity: 0.2,
          time: 300,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'electroball',
        {
          x: attacker.x + 60,
          y: attacker.y - 5,
          z: attacker.z,
          scale: 0.7,
          opacity: 0.7,
          time: 100,
        },
        {
          x: attacker.x,
          y: attacker.y,
          scale: 0.2,
          opacity: 0.2,
          time: 300,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'electroball',
        {
          x: attacker.x - 30,
          y: attacker.y + 60,
          z: attacker.z,
          scale: 0.7,
          opacity: 0.7,
          time: 100,
        },
        {
          x: attacker.x,
          y: attacker.y,
          scale: 0.2,
          opacity: 0.2,
          time: 400,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'electroball',
        {
          x: attacker.x + 20,
          y: attacker.y - 50,
          z: attacker.z,
          scale: 0.7,
          opacity: 0.7,
          time: 100,
        },
        {
          x: attacker.x,
          y: attacker.y,
          scale: 0.2,
          opacity: 0.2,
          time: 400,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'electroball',
        {
          x: attacker.x - 70,
          y: attacker.y - 50,
          z: attacker.z,
          scale: 0.7,
          opacity: 0.7,
          time: 200,
        },
        {
          x: attacker.x,
          y: attacker.y,
          scale: 0.2,
          opacity: 0.2,
          time: 500,
        },
        'linear',
        'fade',
      );
    },
  },
  heal: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'iceball',
        {
          x: attacker.x + 30,
          y: attacker.y + 5,
          z: attacker.z,
          scale: 0.1,
          opacity: 0.7,
          time: 200,
        },
        {
          x: attacker.x + 40,
          y: attacker.y + 10,
          opacity: 0,
          time: 600,
        },
        'accel',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.x - 30,
          y: attacker.y - 10,
          z: attacker.z,
          scale: 0.1,
          opacity: 0.7,
          time: 300,
        },
        {
          x: attacker.x - 40,
          y: attacker.y - 20,
          opacity: 0,
          time: 700,
        },
        'accel',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.x + 15,
          y: attacker.y + 10,
          z: attacker.z,
          scale: 0.1,
          opacity: 0.7,
          time: 400,
        },
        {
          x: attacker.x + 25,
          y: attacker.y + 20,
          opacity: 0,
          time: 800,
        },
        'accel',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.x - 15,
          y: attacker.y - 30,
          z: attacker.z,
          scale: 0.1,
          opacity: 0.7,
          time: 500,
        },
        {
          x: attacker.x - 25,
          y: attacker.y - 40,
          opacity: 0,
          time: 900,
        },
        'accel',
      );
    },
  },
  shiny: {
    anim(scene, [attacker]) {
      scene.backgroundEffect('#000000', 800, 0.3, 100);
      scene.showEffect(
        'shine',
        {
          x: attacker.x + 5,
          y: attacker.y + 20,
          z: attacker.z,
          scale: 0.1,
          opacity: 0.7,
          time: 450,
        },
        {
          y: attacker.y + 35,
          opacity: 0,
          time: 675,
        },
        'decel',
      );
      scene.showEffect(
        'shine',
        {
          x: attacker.x + 15,
          y: attacker.y + 20,
          z: attacker.z,
          scale: 0.2,
          opacity: 0.7,
          time: 475,
        },
        {
          x: attacker.x + 25,
          y: attacker.y + 30,
          opacity: 0,
          time: 700,
        },
        'decel',
      );
      scene.showEffect(
        'shine',
        {
          x: attacker.x - 15,
          y: attacker.y + 20,
          z: attacker.z,
          scale: 0.2,
          opacity: 0.7,
          time: 500,
        },
        {
          x: attacker.x - 25,
          y: attacker.y + 30,
          opacity: 0,
          time: 725,
        },
        'decel',
      );
      scene.showEffect(
        'shine',
        {
          x: attacker.x - 20,
          y: attacker.y + 5,
          z: attacker.z,
          scale: 0.2,
          opacity: 0.7,
          time: 550,
        },
        {
          x: attacker.x - 30,
          y: attacker.y - 5,
          opacity: 0,
          time: 775,
        },
        'decel',
      );
      scene.showEffect(
        'shine',
        {
          x: attacker.x + 15,
          y: attacker.y + 10,
          z: attacker.z,
          scale: 0.2,
          opacity: 0.7,
          time: 650,
        },
        {
          x: attacker.x + 35,
          y: attacker.y - 5,
          opacity: 0,
          time: 875,
        },
        'decel',
      );
      scene.showEffect(
        'shine',
        {
          x: attacker.x + 5,
          y: attacker.y - 5,
          z: attacker.z,
          scale: 0.2,
          opacity: 0.7,
          time: 675,
        },
        {
          y: attacker.y - 20,
          opacity: 0,
          time: 900,
        },
        'decel',
      );
    },
  },
  flight: {
    anim(scene, [attacker, defender]) {
      attacker.anim(
        {
          x: attacker.leftof(-200),
          y: attacker.y + 80,
          z: attacker.z,
          opacity: 0,
          time: 350,
        },
        'accel',
      );
      attacker.anim(
        {
          x: defender.leftof(-200),
          y: defender.y + 80,
          z: defender.z,
          time: 1,
        },
        'linear',
      );
      attacker.anim(
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          opacity: 1,
          time: 350,
        },
        'accel',
      );
      scene.showEffect(
        'wisp',
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          scale: 0,
          opacity: 0.5,
          time: 700,
        },
        {
          scale: 2,
          opacity: 0,
          time: 900,
        },
        'linear',
      );
      attacker.anim({
        x: defender.leftof(100),
        y: defender.y - 40,
        z: defender.z,
        opacity: 0,
        time: 175,
      });
      attacker.anim({
        x: attacker.x,
        y: attacker.y + 40,
        z: attacker.behind(40),
        time: 1,
      });
      attacker.anim(
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          time: 250,
        },
        'decel',
      );
      defender.delay(700);
      defender.anim(
        {
          z: defender.behind(20),
          time: 100,
        },
        'swing',
      );
      defender.anim(
        {
          time: 300,
        },
        'swing',
      );
    },
  },
  shake: {
    anim(scene, [attacker]) {
      attacker.anim({ x: attacker.x - 10, time: 200 });
      attacker.anim({ x: attacker.x + 10, time: 300 });
      attacker.anim({ x: attacker.x, time: 200 });
    },
  },
  dance: {
    anim(scene, [attacker]) {
      attacker.anim({ x: attacker.x - 10 });
      attacker.anim({ x: attacker.x + 10 });
      attacker.anim({ x: attacker.x });
    },
  },
  consume: {
    anim(scene, [defender]) {
      scene.showEffect(
        'wisp',
        {
          x: defender.leftof(-25),
          y: defender.y + 40,
          z: defender.behind(-20),
          scale: 0.5,
          opacity: 1,
        },
        {
          x: defender.leftof(-15),
          y: defender.y + 35,
          z: defender.z,
          scale: 0,
          opacity: 0.2,
          time: 500,
        },
        'swing',
        'fade',
      );

      defender.delay(400);
      defender.anim(
        {
          y: defender.y + 5,
          yscale: 1.1,
          time: 200,
        },
        'swing',
      );
      defender.anim(
        {
          time: 200,
        },
        'swing',
      );
      defender.anim(
        {
          y: defender.y + 5,
          yscale: 1.1,
          time: 200,
        },
        'swing',
      );
      defender.anim(
        {
          time: 200,
        },
        'swing',
      );
    },
  },
  leech: {
    anim(scene, [attacker, defender]) {
      scene.showEffect(
        'energyball',
        {
          x: defender.x - 30,
          y: defender.y - 40,
          z: defender.z,
          scale: 0.2,
          opacity: 0.7,
          time: 0,
        },
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          time: 500,
          opacity: 0.1,
        },
        'ballistic2',
        'fade',
      );
      scene.showEffect(
        'energyball',
        {
          x: defender.x + 40,
          y: defender.y - 35,
          z: defender.z,
          scale: 0.2,
          opacity: 0.7,
          time: 50,
        },
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          time: 550,
          opacity: 0.1,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'energyball',
        {
          x: defender.x + 20,
          y: defender.y - 25,
          z: defender.z,
          scale: 0.2,
          opacity: 0.7,
          time: 100,
        },
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          time: 600,
          opacity: 0.1,
        },
        'ballistic2Under',
        'fade',
      );
    },
  },
  drain: {
    anim(scene, [attacker, defender]) {
      scene.showEffect(
        'energyball',
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          scale: 0.6,
          opacity: 0.6,
          time: 0,
        },
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          time: 500,
          opacity: 0,
        },
        'ballistic2',
      );
      scene.showEffect(
        'energyball',
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          scale: 0.6,
          opacity: 0.6,
          time: 50,
        },
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          time: 550,
          opacity: 0,
        },
        'linear',
      );
      scene.showEffect(
        'energyball',
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          scale: 0.6,
          opacity: 0.6,
          time: 100,
        },
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          time: 600,
          opacity: 0,
        },
        'ballistic2Under',
      );
    },
  },
  hydroshot: {
    anim(scene, [attacker, defender]) {
      scene.showEffect(
        'waterwisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.4,
          opacity: 0.3,
        },
        {
          x: defender.x + 10,
          y: defender.y + 5,
          z: defender.behind(30),
          scale: 1,
          opacity: 0.6,
        },
        'decel',
        'explode',
      );
      scene.showEffect(
        'waterwisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.4,
          opacity: 0.3,
          time: 75,
        },
        {
          x: defender.x - 10,
          y: defender.y - 5,
          z: defender.behind(30),
          scale: 1,
          opacity: 0.6,
        },
        'decel',
        'explode',
      );
      scene.showEffect(
        'waterwisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.4,
          opacity: 0.3,
          time: 150,
        },
        {
          x: defender.x,
          y: defender.y + 5,
          z: defender.behind(30),
          scale: 1,
          opacity: 0.6,
        },
        'decel',
        'explode',
      );
    },
  },
  sound: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'wisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0,
          opacity: 0.7,
          time: 0,
        },
        {
          z: attacker.behind(-50),
          scale: 5,
          opacity: 0,
          time: 400,
        },
        'linear',
      );
      scene.showEffect(
        'wisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0,
          opacity: 0.7,
          time: 150,
        },
        {
          z: attacker.behind(-50),
          scale: 5,
          opacity: 0,
          time: 600,
        },
        'linear',
      );
      scene.showEffect(
        'wisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0,
          opacity: 0.7,
          time: 300,
        },
        {
          z: attacker.behind(-50),
          scale: 5,
          opacity: 0,
          time: 800,
        },
        'linear',
      );
    },
  },
  gravity: {
    anim(scene, [attacker]) {
      attacker.anim(
        {
          y: attacker.y - 20,
          yscale: 0.5,
          time: 300,
        },
        'decel',
      );
      attacker.delay(200);
      attacker.anim({
        time: 300,
      });
    },
  },
  futuresighthit: {
    anim(scene, [defender]) {
      scene.backgroundEffect('#AA44BB', 250, 0.6);
      scene.backgroundEffect('#AA44FF', 250, 0.6, 400);
      defender.anim({
        scale: 1.2,
        time: 100,
      });
      defender.anim({
        scale: 1,
        time: 100,
      });
      defender.anim({
        scale: 1.4,
        time: 150,
      });
      defender.anim({
        scale: 1,
        time: 150,
      });
      scene.wait(700);
    },
  },
  doomdesirehit: {
    anim(scene, [defender]) {
      scene.backgroundEffect('#ffffff', 600, 0.6);
      scene.showEffect(
        'fireball',
        {
          x: defender.x + 40,
          y: defender.y,
          z: defender.z,
          scale: 0,
          opacity: 0.6,
        },
        {
          scale: 6,
          opacity: 0,
        },
        'linear',
      );
      scene.showEffect(
        'fireball',
        {
          x: defender.x - 40,
          y: defender.y - 20,
          z: defender.z,
          scale: 0,
          opacity: 0.6,
          time: 150,
        },
        {
          scale: 6,
          opacity: 0,
        },
        'linear',
      );
      scene.showEffect(
        'fireball',
        {
          x: defender.x + 10,
          y: defender.y + 20,
          z: defender.z,
          scale: 0,
          opacity: 0.6,
          time: 300,
        },
        {
          scale: 6,
          opacity: 0,
        },
        'linear',
      );

      defender.delay(100);
      defender.anim({
        x: defender.x - 30,
        time: 75,
      });
      defender.anim({
        x: defender.x + 30,
        time: 100,
      });
      defender.anim({
        x: defender.x - 30,
        time: 100,
      });
      defender.anim({
        x: defender.x + 30,
        time: 100,
      });
      defender.anim({
        x: defender.x,
        time: 100,
      });
    },
  },
  itemoff: {
    anim(scene, [defender]) {
      scene.showEffect(
        'pokeball',
        {
          x: defender.x,
          y: defender.y,
          z: defender.z,
          scale: 1,
          opacity: 1,
        },
        {
          x: defender.x,
          y: defender.y + 40,
          z: defender.behind(70),
          opacity: 0,
          time: 400,
        },
        'ballistic2',
      );
    },
  },
  anger: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'angry',
        {
          x: attacker.x + 20,
          y: attacker.y + 20,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
          time: 0,
        },
        {
          scale: 1,
          opacity: 1,
          time: 300,
        },
        'ballistic2Under',
        'fade',
      );
      scene.showEffect(
        'angry',
        {
          x: attacker.x - 20,
          y: attacker.y + 10,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
          time: 100,
        },
        {
          scale: 1,
          opacity: 1,
          time: 400,
        },
        'ballistic2Under',
        'fade',
      );
      scene.showEffect(
        'angry',
        {
          x: attacker.x,
          y: attacker.y + 40,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
          time: 200,
        },
        {
          scale: 1,
          opacity: 1,
          time: 500,
        },
        'ballistic2Under',
        'fade',
      );
    },
  },
  bidecharge: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'wisp',
        {
          x: attacker.x + 30,
          y: attacker.y,
          z: attacker.z,
          scale: 1,
          opacity: 1,
          time: 0,
        },
        {
          y: attacker.y + 60,
          opacity: 0.2,
          time: 400,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'wisp',
        {
          x: attacker.x - 30,
          y: attacker.y,
          z: attacker.z,
          scale: 1,
          opacity: 1,
          time: 100,
        },
        {
          y: attacker.y + 60,
          opacity: 0.2,
          time: 500,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'wisp',
        {
          x: attacker.x + 15,
          y: attacker.y,
          z: attacker.z,
          scale: 1,
          opacity: 1,
          time: 200,
        },
        {
          y: attacker.y + 60,
          opacity: 0.2,
          time: 600,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'wisp',
        {
          x: attacker.x - 15,
          y: attacker.y,
          z: attacker.z,
          scale: 1,
          opacity: 1,
          time: 300,
        },
        {
          y: attacker.y + 60,
          opacity: 0.2,
          time: 700,
        },
        'linear',
        'fade',
      );

      attacker.anim(
        {
          x: attacker.x - 2.5,
          time: 75,
        },
        'swing',
      );
      attacker.anim(
        {
          x: attacker.x + 2.5,
          time: 75,
        },
        'swing',
      );
      attacker.anim(
        {
          x: attacker.x - 2.5,
          time: 75,
        },
        'swing',
      );
      attacker.anim(
        {
          x: attacker.x + 2.5,
          time: 75,
        },
        'swing',
      );
      attacker.anim(
        {
          x: attacker.x - 2.5,
          time: 75,
        },
        'swing',
      );
      attacker.anim(
        {
          time: 100,
        },
        'accel',
      );
    },
  },
  bideunleash: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'fireball',
        {
          x: attacker.x + 40,
          y: attacker.y,
          z: attacker.z,
          scale: 0,
          opacity: 0.6,
        },
        {
          scale: 6,
          opacity: 0,
        },
        'linear',
      );
      scene.showEffect(
        'fireball',
        {
          x: attacker.x - 40,
          y: attacker.y - 20,
          z: attacker.z,
          scale: 0,
          opacity: 0.6,
          time: 150,
        },
        {
          scale: 6,
          opacity: 0,
        },
        'linear',
      );
      scene.showEffect(
        'fireball',
        {
          x: attacker.x + 10,
          y: attacker.y + 20,
          z: attacker.z,
          scale: 0,
          opacity: 0.6,
          time: 300,
        },
        {
          scale: 6,
          opacity: 0,
        },
        'linear',
      );

      attacker.anim({
        x: attacker.x - 30,
        time: 75,
      });
      attacker.anim({
        x: attacker.x + 30,
        time: 100,
      });
      attacker.anim({
        x: attacker.x - 30,
        time: 100,
      });
      attacker.anim({
        x: attacker.x + 30,
        time: 100,
      });
      attacker.anim({
        x: attacker.x - 30,
        time: 100,
      });
      attacker.anim({
        x: attacker.x + 30,
        time: 100,
      });
      attacker.anim({
        x: attacker.x,
        time: 100,
      });
    },
  },
  spectralthiefboost: {
    anim(scene, [attacker, defender]) {
      scene.backgroundEffect('linear-gradient(#000000 30%, #440044', 1400, 0.5);
      scene.showEffect(
        'shadowball',
        {
          x: defender.x,
          y: defender.y - 30,
          z: defender.z,
          scale: 0.5,
          xscale: 0.5,
          yscale: 1,
          opacity: 0.5,
        },
        {
          scale: 2,
          xscale: 4,
          opacity: 0.1,
          time: 400,
        },
        'decel',
        'fade',
      );
      scene.showEffect(
        'purplewisp',
        {
          x: defender.x,
          y: defender.y - 25,
          z: defender.z,
          scale: 1,
        },
        {
          x: defender.x + 50,
          scale: 3,
          xscale: 3.5,
          opacity: 0.3,
          time: 500,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'purplewisp',
        {
          x: defender.x,
          y: defender.y - 25,
          z: defender.z,
          scale: 1,
        },
        {
          x: defender.x - 50,
          scale: 3,
          xscale: 3.5,
          opacity: 0.3,
          time: 500,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'shadowball',
        {
          x: defender.x + 35,
          y: defender.y,
          z: defender.z,
          opacity: 0.4,
          scale: 0.25,
          time: 50,
        },
        {
          y: defender.y - 40,
          opacity: 0,
          time: 300,
        },
        'accel',
      );
      scene.showEffect(
        'shadowball',
        {
          x: defender.x - 35,
          y: defender.y,
          z: defender.z,
          opacity: 0.4,
          scale: 0.25,
          time: 100,
        },
        {
          y: defender.y - 40,
          opacity: 0,
          time: 350,
        },
        'accel',
      );
      scene.showEffect(
        'shadowball',
        {
          x: defender.x + 15,
          y: defender.y,
          z: defender.z,
          opacity: 0.4,
          scale: 0.5,
          time: 150,
        },
        {
          y: defender.y - 40,
          opacity: 0,
          time: 400,
        },
        'accel',
      );
      scene.showEffect(
        'shadowball',
        {
          x: defender.x + 15,
          y: defender.y,
          z: defender.z,
          opacity: 0.4,
          scale: 0.25,
          time: 200,
        },
        {
          y: defender.y - 40,
          opacity: 0,
          time: 450,
        },
        'accel',
      );

      scene.showEffect(
        'purplewisp',
        {
          x: defender.x - 50,
          y: defender.y - 40,
          z: defender.z,
          scale: 2,
          opacity: 0.3,
          time: 300,
        },
        {
          x: attacker.x - 50,
          y: attacker.y - 40,
          z: attacker.z,
          time: 900,
        },
        'decel',
        'fade',
      );
      scene.showEffect(
        'purplewisp',
        {
          x: defender.x - 50,
          y: defender.y - 40,
          z: defender.z,
          scale: 2,
          opacity: 0.3,
          time: 400,
        },
        {
          x: attacker.x - 50,
          y: attacker.y - 40,
          z: attacker.z,
          time: 900,
        },
        'decel',
        'fade',
      );
      scene.showEffect(
        'purplewisp',
        {
          x: defender.x,
          y: defender.y - 40,
          z: defender.z,
          scale: 2,
          opacity: 0.3,
          time: 450,
        },
        {
          x: attacker.x,
          y: attacker.y - 40,
          z: attacker.z,
          time: 950,
        },
        'decel',
        'fade',
      );

      scene.showEffect(
        'shadowball',
        {
          x: attacker.x,
          y: attacker.y - 30,
          z: attacker.z,
          scale: 0,
          xscale: 0.5,
          yscale: 1,
          opacity: 0.5,
          time: 750,
        },
        {
          scale: 2,
          xscale: 4,
          opacity: 0.1,
          time: 1200,
        },
        'decel',
        'fade',
      );

      scene.showEffect(
        'shadowball',
        {
          x: attacker.x + 35,
          y: attacker.y - 40,
          z: attacker.z,
          opacity: 0.4,
          scale: 0.25,
          time: 750,
        },
        {
          y: attacker.y,
          opacity: 0,
          time: 1000,
        },
        'decel',
      );
      scene.showEffect(
        'shadowball',
        {
          x: attacker.x - 35,
          y: attacker.y - 40,
          z: attacker.z,
          opacity: 1,
          scale: 0.25,
          time: 800,
        },
        {
          y: attacker.y,
          opacity: 0,
          time: 1150,
        },
        'decel',
      );
      scene.showEffect(
        'shadowball',
        {
          x: attacker.x + 15,
          y: attacker.y - 40,
          z: attacker.z,
          opacity: 1,
          scale: 0.25,
          time: 950,
        },
        {
          y: attacker.y,
          opacity: 0,
          time: 1200,
        },
        'decel',
      );
      scene.showEffect(
        'shadowball',
        {
          x: attacker.x + 15,
          y: attacker.y - 40,
          z: attacker.z,
          opacity: 1,
          scale: 0.25,
          time: 1000,
        },
        {
          y: attacker.y,
          opacity: 0,
          time: 1350,
        },
        'decel',
      );

      scene.showEffect(
        'purplewisp',
        {
          x: attacker.x,
          y: attacker.y - 25,
          z: attacker.z,
          scale: 2,
          opacity: 1,
          time: 750,
        },
        {
          x: attacker.x + 75,
          opacity: 0.3,
          time: 1200,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'purplewisp',
        {
          x: attacker.x,
          y: attacker.y - 25,
          z: attacker.z,
          scale: 2,
          opacity: 1,
          time: 750,
        },
        {
          x: attacker.x - 75,
          opacity: 0.3,
          time: 1200,
        },
        'linear',
        'fade',
      );

      defender.anim({
        x: defender.x - 15,
        time: 75,
      });
      defender.anim({
        x: defender.x + 15,
        time: 100,
      });
      defender.anim({
        x: defender.x - 15,
        time: 100,
      });
      defender.anim({
        x: defender.x + 15,
        time: 100,
      });
      defender.anim({
        x: defender.x - 15,
        time: 100,
      });
      defender.anim({
        x: defender.x + 15,
        time: 100,
      });
      defender.anim({
        x: defender.x,
        time: 100,
      });
    },
  },
  schoolingin: {
    anim(scene, [attacker]) {
      scene.backgroundEffect('#0000DD', 600, 0.2);
      scene.showEffect(
        'wisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 2.5,
          opacity: 1,
        },
        {
          scale: 3,
          time: 600,
        },
        'linear',
        'explode',
      );
      scene.showEffect(
        'waterwisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 3,
          opacity: 0.3,
        },
        {
          scale: 3.25,
          time: 600,
        },
        'linear',
        'explode',
      );

      scene.showEffect(
        'iceball',
        {
          x: attacker.leftof(200),
          y: attacker.y + 40,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
        },
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          opacity: 0,
          time: 200,
        },
        'ballistic',
        'fade',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.leftof(-140),
          y: attacker.y - 60,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
          time: 100,
        },
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          opacity: 0,
          time: 300,
        },
        'ballistic2Under',
        'fade',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.leftof(-140),
          y: attacker.y + 50,
          z: attacker.behind(170),
          scale: 0.5,
          opacity: 0.5,
          time: 200,
        },
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          opacity: 0,
          time: 400,
        },
        'ballistic2',
        'fade',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.x,
          y: attacker.y + 30,
          z: attacker.behind(-250),
          scale: 0.5,
          opacity: 0.5,
          time: 200,
        },
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          opacity: 0,
          time: 500,
        },
        'ballistic',
        'fade',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.leftof(240),
          y: attacker.y - 80,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
          time: 300,
        },
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          opacity: 0,
          time: 600,
        },
        'ballistic2Under',
      );
    },
  },
  schoolingout: {
    anim(scene, [attacker]) {
      scene.backgroundEffect('#0000DD', 600, 0.2);
      scene.showEffect(
        'wisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 3,
          opacity: 1,
        },
        {
          scale: 2,
          time: 600,
        },
        'linear',
        'explode',
      );
      scene.showEffect(
        'waterwisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 3.25,
          opacity: 0.3,
        },
        {
          scale: 2.5,
          time: 600,
        },
        'linear',
        'explode',
      );

      scene.showEffect(
        'iceball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 0,
        },
        {
          x: attacker.leftof(200),
          y: attacker.y + 40,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
          time: 200,
        },
        'ballistic',
        'fade',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 0,
          time: 100,
        },
        {
          x: attacker.leftof(-140),
          y: attacker.y - 60,
          z: attacker.z,
          opacity: 0.5,
          time: 300,
        },
        'ballistic2Under',
        'fade',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 0,
          time: 200,
        },
        {
          x: attacker.leftof(-140),
          y: attacker.y + 50,
          z: attacker.behind(170),
          opacity: 0.5,
          time: 400,
        },
        'ballistic2',
        'fade',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 0,
          time: 200,
        },
        {
          x: attacker.x,
          y: attacker.y + 30,
          z: attacker.behind(-250),
          opacity: 0.5,
          time: 500,
        },
        'ballistic',
        'fade',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 0,
          time: 300,
        },
        {
          x: attacker.leftof(240),
          y: attacker.y - 80,
          z: attacker.z,
          opacity: 0.5,
          time: 600,
        },
        'ballistic2Under',
      );
    },
  },
  primalalpha: {
    anim(scene, [attacker]) {
      scene.backgroundEffect('#0000DD', 500, 0.4);
      scene.showEffect(
        'iceball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 2,
          opacity: 0.2,
          time: 0,
        },
        {
          scale: 0.5,
          opacity: 1,
          time: 300,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 1,
          time: 300,
        },
        {
          scale: 4,
          opacity: 0,
          time: 700,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'shadowball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
          time: 300,
        },
        {
          scale: 5,
          opacity: 0,
          time: 600,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'alpha',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 1,
          time: 300,
        },
        {
          scale: 2.5,
          opacity: 0,
          time: 600,
        },
        'decel',
      );
    },
  },
  primalomega: {
    anim(scene, [attacker]) {
      scene.backgroundEffect('linear-gradient(#390000 30%, #B84038)', 500, 0.4);
      scene.showEffect(
        'flareball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 2,
          opacity: 0.2,
          time: 0,
        },
        {
          scale: 0.5,
          opacity: 1,
          time: 300,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'flareball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 1,
          time: 300,
        },
        {
          scale: 4,
          opacity: 0,
          time: 700,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'shadowball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
          time: 300,
        },
        {
          scale: 5,
          opacity: 0,
          time: 600,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'omega',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 1,
          time: 300,
        },
        {
          scale: 2.5,
          opacity: 0,
          time: 600,
        },
        'decel',
      );
    },
  },
  megaevo: {
    anim(scene, [attacker]) {
      scene.backgroundEffect('#835BA5', 500, 0.6);
      scene.showEffect(
        'iceball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 2,
          opacity: 0.2,
          time: 0,
        },
        {
          scale: 0.5,
          opacity: 1,
          time: 300,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 1,
          time: 300,
        },
        {
          scale: 4,
          opacity: 0,
          time: 700,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'mistball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
          time: 300,
        },
        {
          scale: 5,
          opacity: 0,
          time: 600,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'rainbow',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 1,
          time: 300,
        },
        {
          scale: 5,
          opacity: 0,
          time: 600,
        },
        'linear',
        'fade',
      );
    },
  },
  zpower: {
    anim(scene, [attacker]) {
      scene.backgroundEffect('linear-gradient(#000000 20%, #0000DD)', 1800, 0.4);
      scene.showEffect(
        'electroball',
        {
          x: attacker.x - 60,
          y: attacker.y + 40,
          z: attacker.z,
          scale: 0.7,
          opacity: 0.7,
          time: 0,
        },
        {
          x: attacker.x,
          y: attacker.y,
          scale: 0.2,
          opacity: 0.2,
          time: 300,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'electroball',
        {
          x: attacker.x + 60,
          y: attacker.y - 5,
          z: attacker.z,
          scale: 0.7,
          opacity: 0.7,
          time: 100,
        },
        {
          x: attacker.x,
          y: attacker.y,
          scale: 0.2,
          opacity: 0.2,
          time: 300,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'electroball',
        {
          x: attacker.x - 30,
          y: attacker.y + 60,
          z: attacker.z,
          scale: 0.7,
          opacity: 0.7,
          time: 100,
        },
        {
          x: attacker.x,
          y: attacker.y,
          scale: 0.2,
          opacity: 0.2,
          time: 400,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'electroball',
        {
          x: attacker.x + 20,
          y: attacker.y - 50,
          z: attacker.z,
          scale: 0.7,
          opacity: 0.7,
          time: 100,
        },
        {
          x: attacker.x,
          y: attacker.y,
          scale: 0.2,
          opacity: 0.2,
          time: 400,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'electroball',
        {
          x: attacker.x - 70,
          y: attacker.y - 50,
          z: attacker.z,
          scale: 0.7,
          opacity: 0.7,
          time: 200,
        },
        {
          x: attacker.x,
          y: attacker.y,
          scale: 0.2,
          opacity: 0.2,
          time: 500,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'zsymbol',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.7,
          opacity: 1,
          time: 500,
        },
        {
          scale: 1,
          opacity: 0.5,
          time: 800,
        },
        'decel',
        'explode',
      );
      scene.showEffect(
        attacker.sp,
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          opacity: 0.3,
          time: 800,
        },
        {
          y: attacker.y + 20,
          scale: 2,
          opacity: 0,
          time: 1200,
        },
        'accel',
      );
      scene.showEffect(
        attacker.sp,
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          opacity: 0.3,
          time: 1000,
        },
        {
          y: attacker.y + 20,
          scale: 2,
          opacity: 0,
          time: 1400,
        },
        'accel',
      );
      scene.showEffect(
        attacker.sp,
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          opacity: 0.3,
          time: 1200,
        },
        {
          y: attacker.y + 20,
          scale: 2,
          opacity: 0,
          time: 1600,
        },
        'accel',
      );
    },
  },
  powerconstruct: {
    anim(scene, [attacker]) {
      let xf = [1, -1, 1, -1];
      let yf = [1, -1, -1, 1];
      let xf2 = [1, 0, -1, 0];
      let yf2 = [0, 1, 0, -1];

      scene.backgroundEffect('#000000', 1000, 0.7);
      for (let i = 0; i < 4; i++) {
        scene.showEffect(
          'energyball',
          {
            x: attacker.x + 150 * xf[i],
            y: attacker.y - 50,
            z: attacker.z + 70 * yf[i],
            scale: 0.1,
            xscale: 0.5,
            opacity: 0.4,
          },
          {
            x: attacker.x,
            y: attacker.y - 50,
            z: attacker.z,
            scale: 0.3,
            xscale: 0.8,
            opacity: 0,
            time: 500,
          },
          'decel',
          'fade',
        );
        scene.showEffect(
          'energyball',
          {
            x: attacker.x + 200 * xf2[i],
            y: attacker.y - 50,
            z: attacker.z + 90 * yf2[i],
            scale: 0.1,
            xscale: 0.5,
            opacity: 0.4,
          },
          {
            x: attacker.x,
            y: attacker.y - 50,
            z: attacker.z,
            scale: 0.3,
            xscale: 0.8,
            opacity: 0,
            time: 500,
          },
          'decel',
          'fade',
        );

        scene.showEffect(
          'energyball',
          {
            x: attacker.x + 50 * xf[i],
            y: attacker.y - 50,
            z: attacker.z + 100 * yf[i],
            scale: 0.1,
            xscale: 0.5,
            opacity: 0.4,
            time: 200,
          },
          {
            x: attacker.x,
            y: attacker.y - 50,
            z: attacker.z,
            scale: 0.3,
            xscale: 0.8,
            opacity: 0,
            time: 500,
          },
          'decel',
          'fade',
        );
        scene.showEffect(
          'energyball',
          {
            x: attacker.x + 100 * xf2[i],
            y: attacker.y - 50,
            z: attacker.z + 90 * yf2[i],
            scale: 0.1,
            xscale: 0.5,
            opacity: 0.4,
            time: 200,
          },
          {
            x: attacker.x,
            y: attacker.y - 50,
            z: attacker.z,
            scale: 0.3,
            xscale: 0.8,
            opacity: 0,
            time: 500,
          },
          'decel',
          'fade',
        );
      }
      scene.showEffect(
        'energyball',
        {
          x: attacker.x,
          y: attacker.y - 25,
          z: attacker.z,
          scale: 3,
          opacity: 0,
          time: 50,
        },
        {
          scale: 1,
          opacity: 0.8,
          time: 300,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'energyball',
        {
          x: attacker.x,
          y: attacker.y - 25,
          z: attacker.z,
          scale: 3.5,
          opacity: 0,
          time: 150,
        },
        {
          scale: 1.5,
          opacity: 1,
          time: 350,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'energyball',
        {
          x: attacker.x,
          y: attacker.y - 25,
          z: attacker.z,
          scale: 0.5,
          opacity: 1,
          time: 200,
        },
        {
          scale: 3,
          opacity: 0,
          time: 600,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'wisp',
        {
          x: attacker.x,
          y: attacker.y - 25,
          z: attacker.z,
          scale: 1,
          opacity: 0.6,
          time: 100,
        },
        {
          scale: 3.5,
          opacity: 0.8,
          time: 500,
        },
        'linear',
        'explode',
      );
    },
  },
  ultraburst: {
    anim(scene, [attacker]) {
      scene.backgroundEffect('#000000', 600, 0.5);
      scene.backgroundEffect('#ffffff', 500, 1, 550);
      scene.showEffect(
        'wisp',
        {
          x: attacker.x - 60,
          y: attacker.y + 40,
          z: attacker.z,
          scale: 0.7,
          opacity: 0.7,
          time: 0,
        },
        {
          x: attacker.x,
          y: attacker.y,
          scale: 0.2,
          opacity: 0.2,
          time: 150,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'wisp',
        {
          x: attacker.x + 60,
          y: attacker.y - 5,
          z: attacker.z,
          scale: 0.7,
          opacity: 0.7,
          time: 100,
        },
        {
          x: attacker.x,
          y: attacker.y,
          scale: 0.2,
          opacity: 0.2,
          time: 150,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'wisp',
        {
          x: attacker.x - 30,
          y: attacker.y + 60,
          z: attacker.z,
          scale: 0.7,
          opacity: 0.7,
          time: 100,
        },
        {
          x: attacker.x,
          y: attacker.y,
          scale: 0.2,
          opacity: 0.2,
          time: 250,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'wisp',
        {
          x: attacker.x + 20,
          y: attacker.y - 50,
          z: attacker.z,
          scale: 0.7,
          opacity: 0.7,
          time: 100,
        },
        {
          x: attacker.x,
          y: attacker.y,
          scale: 0.2,
          opacity: 0.2,
          time: 250,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'wisp',
        {
          x: attacker.x - 70,
          y: attacker.y - 50,
          z: attacker.z,
          scale: 0.7,
          opacity: 0.7,
          time: 100,
        },
        {
          x: attacker.x,
          y: attacker.y,
          scale: 0.2,
          opacity: 0.2,
          time: 300,
        },
        'linear',
        'fade',
      );

      scene.showEffect(
        'wisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 1.5,
          opacity: 1,
        },
        {
          scale: 4,
          time: 600,
        },
        'linear',
        'explode',
      );
      scene.showEffect(
        'electroball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 2,
          opacity: 0,
        },
        {
          scale: 2.25,
          opacity: 0.1,
          time: 600,
        },
        'linear',
        'explode',
      );
      scene.showEffect(
        'energyball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 2,
          opacity: 0,
          time: 200,
        },
        {
          scale: 2.25,
          opacity: 0.1,
          time: 600,
        },
        'linear',
        'explode',
      );

      scene.showEffect(
        'electroball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 6,
          opacity: 0.2,
        },
        {
          scale: 1,
          opacity: 0,
          time: 300,
        },
        'linear',
      );
      scene.showEffect(
        'electroball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 6,
          opacity: 0.2,
          time: 150,
        },
        {
          scale: 1,
          opacity: 0,
          time: 450,
        },
        'linear',
      );
      scene.showEffect(
        'electroball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 6,
          opacity: 0.2,
          time: 300,
        },
        {
          scale: 1,
          opacity: 0,
          time: 600,
        },
        'linear',
      );
      scene.showEffect(
        'ultra',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 1,
          time: 600,
        },
        {
          scale: 1,
          opacity: 0,
          time: 900,
        },
        'decel',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.x,
          y: attacker.y - 60,
          z: attacker.z,
          scale: 0.5,
          xscale: 0.25,
          yscale: 0,
          opacity: 0.5,
          time: 600,
        },
        {
          scale: 2,
          xscale: 6,
          yscale: 1,
          opacity: 0,
          time: 800,
        },
        'linear',
      );
      scene.showEffect(
        'iceball',
        {
          x: attacker.x,
          y: attacker.y - 60,
          z: attacker.z,
          scale: 0.5,
          xscale: 0.25,
          yscale: 0.75,
          opacity: 0.5,
          time: 800,
        },
        {
          scale: 2,
          xscale: 6,
          opacity: 0.1,
          time: 1000,
        },
        'linear',
      );
    },
  },
};
export const BattleStatusAnims: AnimTable = {
  brn: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'fireball',
        {
          x: attacker.x - 20,
          y: attacker.y - 15,
          z: attacker.z,
          scale: 0.2,
          opacity: 0.3,
        },
        {
          x: attacker.x + 40,
          y: attacker.y + 15,
          z: attacker.z,
          scale: 1,
          opacity: 1,
          time: 300,
        },
        'swing',
        'fade',
      );
    },
  },
  psn: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'purplewisp',
        {
          x: attacker.x + 30,
          y: attacker.y - 40,
          z: attacker.z,
          scale: 0.2,
          opacity: 1,
          time: 0,
        },
        {
          y: attacker.y,
          scale: 1,
          opacity: 0.5,
          time: 300,
        },
        'decel',
        'fade',
      );
      scene.showEffect(
        'purplewisp',
        {
          x: attacker.x - 30,
          y: attacker.y - 40,
          z: attacker.z,
          scale: 0.2,
          opacity: 1,
          time: 100,
        },
        {
          y: attacker.y,
          scale: 1,
          opacity: 0.5,
          time: 400,
        },
        'decel',
        'fade',
      );
      scene.showEffect(
        'purplewisp',
        {
          x: attacker.x,
          y: attacker.y - 40,
          z: attacker.z,
          scale: 0.2,
          opacity: 1,
          time: 200,
        },
        {
          y: attacker.y,
          scale: 1,
          opacity: 0.5,
          time: 500,
        },
        'decel',
        'fade',
      );
    },
  },
  slp: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'wisp',
        {
          x: attacker.x,
          y: attacker.y + 20,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.1,
        },
        {
          x: attacker.x,
          y: attacker.y + 20,
          z: attacker.behind(-50),
          scale: 1.5,
          opacity: 1,
          time: 400,
        },
        'ballistic2Under',
        'fade',
      );
      scene.showEffect(
        'wisp',
        {
          x: attacker.x,
          y: attacker.y + 20,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.1,
          time: 200,
        },
        {
          x: attacker.x,
          y: attacker.y + 20,
          z: attacker.behind(-50),
          scale: 1.5,
          opacity: 1,
          time: 600,
        },
        'ballistic2Under',
        'fade',
      );
    },
  },
  par: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'electroball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 1.5,
          opacity: 0.2,
        },
        {
          scale: 2,
          opacity: 0.1,
          time: 300,
        },
        'linear',
        'fade',
      );

      attacker.delay(100);
      attacker.anim(
        {
          x: attacker.x - 1,
          time: 75,
        },
        'swing',
      );
      attacker.anim(
        {
          x: attacker.x + 1,
          time: 75,
        },
        'swing',
      );
      attacker.anim(
        {
          x: attacker.x - 1,
          time: 75,
        },
        'swing',
      );
      attacker.anim(
        {
          x: attacker.x + 1,
          time: 75,
        },
        'swing',
      );
      attacker.anim(
        {
          x: attacker.x - 1,
          time: 75,
        },
        'swing',
      );
      attacker.anim(
        {
          time: 100,
        },
        'accel',
      );
    },
  },
  frz: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'icicle',
        {
          x: attacker.x - 30,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
          time: 200,
        },
        {
          scale: 0.9,
          opacity: 0,
          time: 600,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'icicle',
        {
          x: attacker.x,
          y: attacker.y - 30,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
          time: 300,
        },
        {
          scale: 0.9,
          opacity: 0,
          time: 650,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'icicle',
        {
          x: attacker.x + 15,
          y: attacker.y,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
          time: 400,
        },
        {
          scale: 0.9,
          opacity: 0,
          time: 700,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'wisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 1,
          opacity: 0.5,
        },
        {
          scale: 3,
          opacity: 0,
          time: 600,
        },
        'linear',
        'fade',
      );
    },
  },
  flinch: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'shadowball',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 1,
          opacity: 0.2,
        },
        {
          scale: 3,
          opacity: 0.1,
          time: 300,
        },
        'linear',
        'fade',
      );
    },
  },
  attracted: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'heart',
        {
          x: attacker.x + 20,
          y: attacker.y + 20,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
          time: 0,
        },
        {
          scale: 1,
          opacity: 1,
          time: 300,
        },
        'ballistic2Under',
        'fade',
      );
      scene.showEffect(
        'heart',
        {
          x: attacker.x - 20,
          y: attacker.y + 10,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
          time: 100,
        },
        {
          scale: 1,
          opacity: 1,
          time: 400,
        },
        'ballistic2Under',
        'fade',
      );
      scene.showEffect(
        'heart',
        {
          x: attacker.x,
          y: attacker.y + 40,
          z: attacker.z,
          scale: 0.5,
          opacity: 0.5,
          time: 200,
        },
        {
          scale: 1,
          opacity: 1,
          time: 500,
        },
        'ballistic2Under',
        'fade',
      );
    },
  },
  cursed: {
    anim(scene, [attacker]) {
      scene.backgroundEffect('#000000', 700, 0.2);
      attacker.delay(300);
      attacker.anim({ x: attacker.x - 5, time: 50 });
      attacker.anim({ x: attacker.x + 5, time: 50 });
      attacker.anim({ x: attacker.x - 5, time: 50 });
      attacker.anim({ x: attacker.x + 5, time: 50 });
      attacker.anim({ x: attacker.x, time: 50 });

      scene.showEffect(
        attacker.sp,
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          opacity: 0.5,
          time: 0,
        },
        {
          z: attacker.behind(20),
          opacity: 0,
          time: 600,
        },
        'decel',
      );
    },
  },
  confused: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'electroball',
        {
          x: attacker.x + 50,
          y: attacker.y + 30,
          z: attacker.z,
          scale: 0.1,
          opacity: 1,
          time: 400,
        },
        {
          x: attacker.x - 50,
          scale: 0.15,
          opacity: 0.4,
          time: 600,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'electroball',
        {
          x: attacker.x - 50,
          y: attacker.y + 30,
          z: attacker.z,
          scale: 0.1,
          opacity: 1,
          time: 400,
        },
        {
          x: attacker.x + 50,
          scale: 0.15,
          opacity: 0.4,
          time: 600,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'electroball',
        {
          x: attacker.x + 50,
          y: attacker.y + 30,
          z: attacker.z,
          scale: 0.1,
          opacity: 1,
          time: 600,
        },
        {
          x: attacker.x - 50,
          scale: 0.4,
          opacity: 0.4,
          time: 800,
        },
        'linear',
        'fade',
      );
      scene.showEffect(
        'electroball',
        {
          x: attacker.x - 50,
          y: attacker.y + 30,
          z: attacker.z,
          scale: 0.15,
          opacity: 1,
          time: 600,
        },
        {
          x: attacker.x + 50,
          scale: 0.4,
          opacity: 0.4,
          time: 800,
        },
        'linear',
        'fade',
      );
    },
  },
  confusedselfhit: {
    anim(scene, [attacker]) {
      scene.showEffect(
        'wisp',
        {
          x: attacker.x,
          y: attacker.y,
          z: attacker.z,
          scale: 0,
          opacity: 0.5,
        },
        {
          scale: 2,
          opacity: 0,
          time: 200,
        },
        'linear',
      );
      attacker.delay(50);
      attacker.anim(
        {
          x: attacker.leftof(2),
          z: attacker.behind(5),
          time: 100,
        },
        'swing',
      );
      attacker.anim(
        {
          time: 300,
        },
        'swing',
      );
    },
  },
};
BattleStatusAnims['focuspunch'] = { anim: BattleStatusAnims['flinch'].anim };
