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

import type { SpriteData } from './types';

export const BattleEffects: { [k: string]: SpriteData } = {
  wisp: {
    url: 'wisp.png',
    w: 100,
    h: 100,
  },
  purplewisp: {
    url: 'purplewisp.png',
    w: 100,
    h: 100,
  },
  waterwisp: {
    url: 'waterwisp.png',
    w: 100,
    h: 100,
  },
  mudwisp: {
    url: 'mudwisp.png',
    w: 100,
    h: 100,
  },
  blackwisp: {
    url: 'blackwisp.png',
    w: 100,
    h: 100,
  },
  fireball: {
    url: 'fireball.png',
    w: 64,
    h: 64,
  },
  bluefireball: {
    url: 'bluefireball.png',
    w: 64,
    h: 64,
  },
  icicle: {
    url: 'icicle.png', // http://opengameart.org/content/icicle-spell
    w: 80,
    h: 60,
  },
  pinkicicle: {
    url: 'icicle-pink.png', // http://opengameart.org/content/icicle-spell, recolored by Kalalokki
    w: 80,
    h: 60,
  },
  lightning: {
    url: 'lightning.png', // by Pokemon Showdown user SailorCosmos
    w: 41,
    h: 229,
  },
  rocks: {
    url: 'rocks.png', // Pokemon Online - Gilad
    w: 100,
    h: 100,
  },
  rock1: {
    url: 'rock1.png', // Pokemon Online - Gilad
    w: 64,
    h: 80,
  },
  rock2: {
    url: 'rock2.png', // Pokemon Online - Gilad
    w: 66,
    h: 72,
  },
  rock3: {
    url: 'rock3.png', // by Pokemon Showdown user SailorCosmos
    w: 66,
    h: 72,
  },
  leaf1: {
    url: 'leaf1.png',
    w: 32,
    h: 26,
  },
  leaf2: {
    url: 'leaf2.png',
    w: 40,
    h: 26,
  },
  bone: {
    url: 'bone.png',
    w: 29,
    h: 29,
  },
  caltrop: {
    url: 'caltrop.png', // by Pokemon Showdown user SailorCosmos
    w: 80,
    h: 80,
  },
  greenmetal1: {
    url: 'greenmetal1.png', // by Pokemon Showdown user Kalalokki
    w: 45,
    h: 45,
  },
  greenmetal2: {
    url: 'greenmetal2.png', // by Pokemon Showdown user Kalalokki
    w: 45,
    h: 45,
  },
  poisoncaltrop: {
    url: 'poisoncaltrop.png', // by Pokemon Showdown user SailorCosmos
    w: 80,
    h: 80,
  },
  shadowball: {
    url: 'shadowball.png',
    w: 100,
    h: 100,
  },
  energyball: {
    url: 'energyball.png',
    w: 100,
    h: 100,
  },
  electroball: {
    url: 'electroball.png',
    w: 100,
    h: 100,
  },
  mistball: {
    url: 'mistball.png',
    w: 100,
    h: 100,
  },
  iceball: {
    url: 'iceball.png',
    w: 100,
    h: 100,
  },
  flareball: {
    url: 'flareball.png',
    w: 100,
    h: 100,
  },
  moon: {
    url: 'moon.png', // by Kalalokki
    w: 100,
    h: 100,
  },
  pokeball: {
    url: 'pokeball.png',
    w: 24,
    h: 24,
  },
  fist: {
    url: 'fist.png', // by Pokemon Showdown user SailorCosmos
    w: 55,
    h: 49,
  },
  fist1: {
    url: 'fist1.png',
    w: 49,
    h: 55,
  },
  foot: {
    url: 'foot.png', // by Pokemon Showdown user SailorCosmos
    w: 50,
    h: 75,
  },
  topbite: {
    url: 'topbite.png',
    w: 108,
    h: 64,
  },
  bottombite: {
    url: 'bottombite.png',
    w: 108,
    h: 64,
  },
  web: {
    url: 'web.png', // by Pokemon Showdown user SailorCosmos
    w: 120,
    h: 122,
  },
  leftclaw: {
    url: 'leftclaw.png',
    w: 44,
    h: 60,
  },
  rightclaw: {
    url: 'rightclaw.png',
    w: 44,
    h: 60,
  },
  leftslash: {
    url: 'leftslash.png', // by Pokemon Showdown user Modeling Clay
    w: 57,
    h: 56,
  },
  rightslash: {
    url: 'rightslash.png', // by Pokemon Showdown user Modeling Clay
    w: 57,
    h: 56,
  },
  leftchop: {
    url: 'leftchop.png', // by Pokemon Showdown user SailorCosmos
    w: 100,
    h: 130,
  },
  rightchop: {
    url: 'rightchop.png', // by Pokemon Showdown user SailorCosmos
    w: 100,
    h: 130,
  },
  angry: {
    url: 'angry.png', // by Pokemon Showdown user SailorCosmos
    w: 30,
    h: 30,
  },
  heart: {
    url: 'heart.png', // by Pokemon Showdown user SailorCosmos
    w: 30,
    h: 30,
  },
  pointer: {
    url: 'pointer.png', // by Pokemon Showdown user SailorCosmos
    w: 100,
    h: 100,
  },
  sword: {
    url: 'sword.png', // by Pokemon Showdown user SailorCosmos
    w: 48,
    h: 100,
  },
  impact: {
    url: 'impact.png', // by Pokemon Showdown user SailorCosmos
    w: 127,
    h: 119,
  },
  stare: {
    url: 'stare.png',
    w: 100,
    h: 35,
  },
  shine: {
    url: 'shine.png', // by Smogon user Jajoken
    w: 127,
    h: 119,
  },
  feather: {
    url: 'feather.png', // Ripped from http://www.clker.com/clipart-black-and-white-feather.html
    w: 100,
    h: 38,
  },
  shell: {
    url: 'shell.png', // by Smogon user Jajoken
    w: 100,
    h: 91.5,
  },
  petal: {
    url: 'petal.png', // by Smogon user Jajoken
    w: 60,
    h: 60,
  },
  gear: {
    url: 'gear.png', // by Smogon user Jajoken
    w: 100,
    h: 100,
  },
  alpha: {
    url: 'alpha.png', // Ripped from Pokemon Global Link
    w: 80,
    h: 80,
  },
  omega: {
    url: 'omega.png', // Ripped from Pokemon Global Link
    w: 80,
    h: 80,
  },
  rainbow: {
    url: 'rainbow.png',
    w: 128,
    h: 128,
  },
  zsymbol: {
    url: 'z-symbol.png', // From http://froggybutt.deviantart.com/art/Pokemon-Z-Move-symbol-633125033
    w: 150,
    h: 100,
  },
  ultra: {
    url: 'ultra.png', // by Pokemon Showdown user Modeling Clay
    w: 113,
    h: 165,
  },
  hitmark: {
    url: 'hitmarker.png', // by Pokemon Showdown user Ridaz
    w: 100,
    h: 100,
  },
  protect: {
    rawHTML: '<div class="turnstatus-protect" style="display:none;position:absolute" />',
    w: 100,
    h: 70,
  },
  auroraveil: {
    rawHTML: '<div class="sidecondition-auroraveil" style="display:none;position:absolute" />',
    w: 100,
    h: 50,
  },
  reflect: {
    rawHTML: '<div class="sidecondition-reflect" style="display:none;position:absolute" />',
    w: 100,
    h: 50,
  },
  safeguard: {
    rawHTML: '<div class="sidecondition-safeguard" style="display:none;position:absolute" />',
    w: 100,
    h: 50,
  },
  lightscreen: {
    rawHTML: '<div class="sidecondition-lightscreen" style="display:none;position:absolute" />',
    w: 100,
    h: 50,
  },
  mist: {
    rawHTML: '<div class="sidecondition-mist" style="display:none;position:absolute" />',
    w: 100,
    h: 50,
  },
};
