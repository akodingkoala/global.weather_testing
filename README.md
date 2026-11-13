# Pixel Weather

A pixel-art weather website. The sky, clouds, ground and particles change with
the real weather for your location (or any city), and a small cast of critters
lives on the screen.

# Features

- **Live weather** from [Open-Meteo](https://open-meteo.com/) (free, no API key):
  sun, clouds, rain, thunderstorms, snow and fog, by day or night.
- **Finds you automatically**: approximate location from your connection right away (no prompt), upgraded to your exact location if you allow it.
- **Search any city**, or tap one of the quick global cities.
- **Preview buttons** to try every weather type and day/night.
- **Pixel critters** drawn in code from tiny pixel grids: a frog, a cat, a snail,
  a little bird and a cloud buddy.

#wat u can do

- Click a critter to make it jump and talk.
- Drag a critter and toss it across the screen.
- The cat chases your cursor when it is near the ground.
- In rain your cursor becomes an umbrella that raindrops bounce off.
- Click the sky: lightning in a storm, splashes in rain, snow bursts in snow,
  sparkles in sun, shooting stars at night, new clouds when cloudy or foggy.
- Click the sun (it winks) or the moon (it's sleeping).

## Run it

It's a static site, so open `index.html` or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.
