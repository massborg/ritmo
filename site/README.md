# Ritmo Running website

Static marketing site with a waitlist. No build step, no JavaScript.

- `index.html`, `styles.css`, `thanks.html` (shown after joining the waitlist)
- `img/`: real app screenshots and the social sharing image (`og.png`)
- `brand/`: copies of the official logo files (never redrawn or recoloured)
- Waitlist: Netlify Forms (`data-netlify="true"`), free up to 100 sign-ups a month. Sign-ups appear under
  Forms in the Netlify dashboard; you can turn on email notifications there.

## Publishing (needs approval)
Create a new Netlify site from this repository with base directory `site`, publish directory `site`,
no build command. Or drag the `site` folder onto Netlify's deploy page.
