// Pixel-art sprites. Each sprite is a grid of characters; '.' is transparent,
// every other character maps to a colour in PALETTE. A dark outline is added
// automatically when the sprite is built, so the grids only hold the fill.
window.PIXEL = (() => {
  const PALETTE = {
    K: '#2b2135', // ink
    W: '#ffffff',
    G: '#5cc45c', g: '#3e8e4a', L: '#d9f2a5', // frog
    P: '#ff9eb5', H: '#ff5c8a',               // pink cheeks, hearts
    O: '#f4a24a', o: '#c46f2a', C: '#fff1dc', // cat
    U: '#b48cff', u: '#7d5bd1',               // snail shell
    Y: '#ffd84a', y: '#e0a92a',               // snail body, bird
    N: '#ffffff', n: '#cfdbea',               // cloud buddy
    R: '#ff5d6c', B: '#6ab8ff', V: '#b48cff', // umbrellas
  };

  const frog0 = [
    '...GG..GG...',
    '..GWKGGWKG..',
    '..GWWGGWWG..',
    '.GGGGGGGGGG.',
    '.GPGGGGGGPG.',
    '.GGGKGGKGGG.',
    '.GGGGKKGGGG.',
    '..GLLLLLLG..',
    '.GGLLLLLLGG.',
    'GG.GG..GG.GG',
  ];
  const frog1 = frog0.slice(0, 9).concat(['.GG......GG.']);

  const catTop = [
    '.O.......O...',
    '.OO.....OO...',
    '.OOoOoOoOO...',
    '.OWKOOOWKO...',
    '.OOOOPOOOO..O',
    '.OOOKOKOOO..O',
    '..OOOOOOO..O.',
    '..OCCCCCOOOO.',
    '..OCCCCCOOO..',
  ];
  const cat0 = catTop.concat(['..O.O...O.O..']);
  const cat1 = catTop.concat(['...O.O.O.O...']);

  const snail0 = [
    '....UUUU..K.K',
    '...UUuuUU.Y.Y',
    '..UUuUUuUUYYY',
    '..UuUuuUuUYKY',
    '..UuUUUUuUYYY',
    '..UUuuuuUUYPY',
    'YYYYYYYYYYYYY',
    '.YYYYYYYYYYY.',
  ];
  const snail1 = ['....UUUU.K..K'].concat(snail0.slice(1, 7), ['YYYYYYYYYYYY.']);

  const cloud0 = [
    '.....NNNN.....',
    '...NNNNNNNN...',
    '.NNNNNNNNNNNN.',
    'NNNNKNNNNKNNNN',
    'NNNPNNNNNNPNNN',
    'NNNNNNKKNNNNNN',
    '.nNNNNNNNNNNn.',
    '..nnnnnnnnnn..',
  ];
  const cloud1 = cloud0.slice();
  cloud1[3] = 'NNNNNNNNNNNNNN';
  cloud1[4] = 'NNNPKNNNNKPNNN';

  const bird0 = [
    '...YYY...',
    '..YYYKY..',
    '.YYYYYYOO',
    'YYyYYYYY.',
    '.YyyYYY..',
    '..YYYY...',
  ];
  const bird1 = [
    'yy.YYY...',
    '.yyYYKY..',
    '.YYYYYYOO',
    'YYYYYYYY.',
    '.YYYYYY..',
    '..YYYY...',
  ];

  const umbrella = [
    '....RRR....',
    '..RRRRRRR..',
    '.RRWRRRRRR.',
    'RRRRRRRRRRR',
    '.....K.....',
    '.....K.....',
  ];
  const recolor = (rows, ch) => rows.map(r => r.replaceAll('R', ch));

  const heart = ['HH.HH', 'HHHHH', '.HHH.', '..H..'];

  return {
    PALETTE,
    SPRITES: {
      frog0, frog1, cat0, cat1, snail0, snail1, cloud0, cloud1, bird0, bird1,
      umbR: umbrella, umbB: recolor(umbrella, 'B'), umbY: recolor(umbrella, 'Y'), umbV: recolor(umbrella, 'V'),
      heart,
    },
  };
})();
