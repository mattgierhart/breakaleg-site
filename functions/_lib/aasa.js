// Apple App Site Association (CONTRACT.md section 4). Served as application/json with no redirect and no extension.
export const AASA = {
  applinks: {
    details: [
      {
        appIDs: ['GHUN5FZ4NP.com.gearheart.breakaleg'],
        components: [{ '/': '/show/*' }],
      },
    ],
  },
};

export function aasaResponse() {
  return new Response(JSON.stringify(AASA), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
