import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { Caption } from '@/providers/captions';
import { ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

import { urlifyTitle } from './helpers';

const baseUrl = 'https://www.diziyou.one/';

const headers = {
  Referer: baseUrl,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
};

async function scrapeShow(ctx: ShowScrapeContext): Promise<SourcererOutput> {
  if (!ctx.media.imdbId) {
    throw new NotFoundError('IMDb id not provided');
  }

  const urlTitle = urlifyTitle(ctx.media.title);
  const showPage = await ctx.proxiedFetcher<string>(`/${urlTitle}/`, {
    baseUrl,
    headers,
  });

  ctx.progress(30);
  if (showPage.includes('404 Not Found')) {
    throw new NotFoundError('Media not found');
  }

  const mediaUrl = `/${urlTitle}-${ctx.media.season.number}-sezon-${ctx.media.episode.number}-bolum/`;

  const mediaPage = await ctx.proxiedFetcher<string>(mediaUrl, {
    baseUrl,
    headers,
  });

  // If there is no turkish dubbed
  if (!mediaPage.includes('<span class="diziyouOption" id="turkceDublaj">')) {
    throw new NotFoundError('Dubbed version not found');
  }

  let iframeUrl = mediaPage.split('<iframe id="diziyouPlayer" src="')[1]?.split('"')[0];
  if (!iframeUrl) throw new NotFoundError('No source found');
  iframeUrl = iframeUrl.replace('.html', '_tr.html');

  ctx.progress(60);

  const playerResponse = await ctx.proxiedFetcher<string>(iframeUrl, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: baseUrl,
      'Sec-Fetch-Dest': 'iframe',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'cross-site',
      'Sec-Fetch-User': '?1',
      'Sec-GPC': '1',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
  });

  ctx.progress(80);
  const playlistUrl = playerResponse.split('<source id="diziyouSource" src="')[1]?.split('"')[0];

  const captions: Caption[] = [];
  const regex = /<track\s+src="([^"]+)"[^>]*srclang="([^"]+)"[^>]*label="([^"]+)"/g;
  const captionMatches = playerResponse.matchAll(regex);

  for (const match of captionMatches) {
    const decideType = match[1].endsWith('.vtt') ? 'vtt' : 'srt';

    captions.push({
      url: match[1],
      language: match[2],
      hasCorsRestrictions: false,
      id: `diziyou-${ctx.media.tmdbId}-caption-${match[2]}`,
      type: decideType,
    });
  }

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        type: 'hls',
        playlist: playlistUrl,
        headers,
        flags: [flags.CORS_ALLOWED],
        captions,
      },
    ],
  };
}

export const diziyouScraper = makeSourcerer({
  id: 'diziyou',
  name: 'Diziyou (Turkish)',
  rank: 217,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeShow,
});
