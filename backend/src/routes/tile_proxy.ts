import { Router, Request, Response } from 'express';
import https from 'https';
import logger from '../utils/logger';

const router = Router();

const LEAFLET_CDN = 'https://unpkg.com/leaflet@1.9.4/dist/images';
const MAP_TILE_CDN = 'https://basemaps.cartocdn.com/light_all';

function proxyImage(url: string, res: Response): void {
  const req = https.get(url, (proxyRes) => {
    if (proxyRes.statusCode !== 200) {
      res.status(proxyRes.statusCode || 500).end();
      return;
    }
    if (proxyRes.headers['content-type']) {
      res.setHeader('Content-Type', proxyRes.headers['content-type']);
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    proxyRes.pipe(res);
  });
  req.on('error', () => res.status(502).end());
  req.setTimeout(10000, () => { req.destroy(); res.status(504).end(); });
}

router.get('/leaflet-assets/:file', (req: Request, res: Response) => {
  proxyImage(`${LEAFLET_CDN}/${req.params.file}`, res);
});

router.get('/map-tiles/:z/:x/:y.png', (req: Request, res: Response) => {
  const { z, x, y } = req.params;
  const url = `${MAP_TILE_CDN}/${z}/${x}/${y}.png`;

  const proxyReq = https.get(url, (proxyRes) => {
    if (proxyRes.statusCode !== 200) {
      logger.warn(`Tile proxy: ${url} returned ${proxyRes.statusCode}`);
      res.status(proxyRes.statusCode || 500).end();
      return;
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    logger.error(`Tile proxy error for ${url}: ${err.message}`);
    res.status(502).end();
  });

  proxyReq.setTimeout(10000, () => {
    proxyReq.destroy();
    res.status(504).end();
  });
});

export default router;
