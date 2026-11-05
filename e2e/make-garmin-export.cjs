// Builds a Garmin-style account export ZIP for tests: ~300 run summaries over two years (Garmin units:
// centimetres and milliseconds) plus a nested ZIP of GPX files with full tracks and heart rate.
const JSZip = require('../node_modules/jszip');

function gpx(startIso, km, paceS, hr) {
  const t0 = new Date(startIso).getTime();
  const pts = [];
  const lat0 = 35.9, lon0 = 14.5;
  const total = km * 1000;
  for (let d = 0, t = 0; d <= total; d += 25, t += paceS * 0.025) {
    // a straight route north, so the GPS distance matches the summary like a real recording
    pts.push(`<trkpt lat="${(lat0 + d / 111195).toFixed(7)}" lon="${lon0.toFixed(6)}"><ele>${(10 + Math.sin(d / 700) * 5).toFixed(1)}</ele><time>${new Date(t0 + t * 1000).toISOString()}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${hr + Math.round(Math.sin(d / 900) * 3)}</gpxtpx:hr><gpxtpx:cad>85</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>`);
  }
  return `<?xml version="1.0"?><gpx version="1.1" creator="Garmin Connect" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><name>Morning Run</name><type>running</type><trkseg>${pts.join('')}</trkseg></trk></gpx>`;
}

async function makeGarminExport() {
  const runs = [];
  const start = new Date('2024-11-04T07:00:00Z').getTime();
  let id = 9000000000;
  for (let day = 0; day < 730; day++) {
    const dow = day % 7;
    if (![1, 3, 5, 6].includes(dow)) continue;
    const ts = start + day * 86400000;
    const progress = day / 730;
    const easy = 345 - progress * 25; // s/km
    const long = dow === 6, quality = dow === 3;
    const km = long ? 14 + progress * 6 : quality ? 9 : 7 + progress * 2;
    const pace = quality ? easy - 55 : easy + (long ? 10 : 0);
    const hr = quality ? 168 : long ? 146 : 140;
    runs.push({ activityId: id++, name: long ? 'Long Run' : quality ? 'Tempo' : 'Easy Run', activityType: 'running', beginTimestamp: ts, distance: km * 100000, duration: km * pace * 1000, movingDuration: km * pace * 1000, elevationGain: 4000, avgHr: hr, maxHr: hr + 12, avgDoubleCadence: 168 });
  }
  // a cycling ride that must be ignored
  runs.push({ activityId: id++, name: 'Ride', activityType: 'cycling', beginTimestamp: start + 5 * 86400000, distance: 3000000, duration: 3600000 });
  const zip = new JSZip();
  zip.file('DI_CONNECT/DI-Connect-Fitness/user@example.com_0_summarizedActivities.json', JSON.stringify([{ summarizedActivitiesExport: runs }]));
  const inner = new JSZip();
  const recent = runs.filter((r) => r.activityType === 'running').slice(-4);
  for (const r of recent) inner.file(`${r.activityId}.gpx`, gpx(new Date(r.beginTimestamp).toISOString(), r.distance / 100000, r.duration / 1000 / (r.distance / 100000), r.avgHr));
  zip.file('DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip', await inner.generateAsync({ type: 'nodebuffer' }));
  zip.file('DI_CONNECT/DI-Connect-User/user_profile.json', '{}');
  return { buffer: await zip.generateAsync({ type: 'nodebuffer' }), runCount: runs.filter((r) => r.activityType === 'running').length };
}

module.exports = { makeGarminExport };
