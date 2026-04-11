/**
 * projEngine.js - PitchIQ shared projection engine
 * Single source of truth for expected points across all tools.
 *
 * xG blend: 70% recent (xg90Recent from bootstrap) + 30% season
 *
 * CS probability uses BOTH:
 *   oppXg    - opponent's attacking threat (how likely they score)
 *   teamXgc  - player's own team's defensive record (how well they defend)
 *   Combined: csInput = oppXg * teamDefFactor
 *   where teamDefFactor = teamXgc / 1.25 (normalised around league average)
 *   Arsenal (low xGC) -> teamDefFactor < 1 -> lower effective threat -> higher CS
 *   Burnley (high xGC) -> teamDefFactor > 1 -> higher effective threat -> lower CS
 *
 * GW1: DEF/GK: physics 0.50 + ep_next 0.40 + ppg 0.10
 *      MID/FWD: physics 0.40 + ep_next 0.45 + ppg 0.15
 * GW2+: physics 0.55 + ppg 0.45
 */

function pitchiqPhysics(p, fix, mins) {
  if (!fix) return 0;
  var mf  = Math.min((mins || 75) / 90, 1);
  var pos = p.pos;
  var app = (mins || 75) >= 60 ? 2 : 1;

  var oppXg  = fix.oppXg  != null ? fix.oppXg  : [0,0.7,1.0,1.3,1.6,2.0][fix.diff != null ? fix.diff : 3];
  var oppXgc = fix.oppXgc != null ? fix.oppXgc : [0,1.8,1.5,1.25,1.0,0.7][fix.diff != null ? fix.diff : 3];

  // Own team's defensive xGC - how many goals this team's defence concedes
  // Normalised around league average (1.25) to get a multiplier
  // Low teamXgc (good defence like Arsenal) -> factor < 1 -> amplifies CS probability
  // High teamXgc (poor defence like Burnley) -> factor > 1 -> reduces CS probability
  var teamXgc = fix.teamXgc != null ? fix.teamXgc : 1.25;
  var teamDefFactor = Math.max(0.5, Math.min(teamXgc / 1.25, 2.0));

  // Effective threat faced = opponent attack * own defensive quality
  var effectiveThreat = oppXg * teamDefFactor;

  var oppDef = Math.max(0.45, Math.min(oppXgc / 1.25, 2.2));

  // xG blend: 70% recent, 30% season
  var l6 = (typeof L6_CACHE !== 'undefined') ? L6_CACHE.get(p.id) : null;
  var pXgRecent = (l6 && l6.xg90L6) ? l6.xg90L6 : (p.xg90Recent || 0);
  var pXaRecent = (l6 && l6.xa90L6) ? l6.xa90L6 : (p.xa90Recent || 0);
  var pXg = pXgRecent > 0.01 ? Math.min((p.xg90||0)*0.30 + pXgRecent*0.70, 1.2) : (p.xg90||0);
  var pXa = pXaRecent > 0.01 ? Math.min((p.xa90||0)*0.30 + pXaRecent*0.70, 0.9) : (p.xa90||0);

  var goalPts = pos==='FWD' ? 4 : pos==='MID' ? 5 : 6;
  var attPts  = (pXg * oppDef * goalPts + pXa * oppDef * 3) * mf;
  var setPiece = p.isPenTaker ? 0.7 * mf : 0;

  // CS probability: Poisson using effective threat (opponent attack x own defence)
  var csProb  = Math.exp(-Math.max(effectiveThreat * mf, 0.01));
  var csPer   = (pos==='GK'||pos==='DEF') ? 4 : pos==='MID' ? 1 : 0;
  var csPts   = csProb * csPer * ((mins||75) >= 60 ? 1.0 : 0.5);
  var savePts = pos==='GK' ? (effectiveThreat * 2.5 * mf) / 3 : 0;

  return app + attPts + setPiece + csPts + savePts;
}

function pitchiqProj(p, gwIndex) {
  var chanceNext = p.chanceNext != null ? p.chanceNext : 100;
  var avail = chanceNext < 100 ? chanceNext/100
            : p.status==='i' ? 0
            : p.status==='d' ? 0.55
            : 1;

  var mins  = p.minsRel != null ? p.minsRel : 75;
  var mf    = Math.min(mins/90, 1);
  var pos   = p.pos;
  var fThis = p.fixes ? p.fixes[gwIndex] : null;
  if (!fThis) return 0;

  var epCaps   = {GK:7.5, DEF:9.0, MID:12.0, FWD:11.0};
  var epCapped = p.epNext > 0 ? Math.min(p.epNext, epCaps[pos]||12.0) : 0;
  var ppgDef   = (pos==='GK'||pos==='DEF') ? 4.5 : 5.0;
  var ppg      = p.ppg > 0 ? p.ppg : ppgDef;

  if (gwIndex === 0) {
    var phys = pitchiqPhysics(p, fThis, mins);
    var wPhys, wEp, wPpg;
    if (pos==='GK'||pos==='DEF') { wPhys=0.50; wEp=0.40; wPpg=0.10; }
    else                          { wPhys=0.40; wEp=0.45; wPpg=0.15; }
    var base = phys*wPhys + epCapped*wEp + ppg*wPpg;
    return Math.max(Math.round(base * mf * avail * 10) / 10, 0);
  } else {
    var phys2  = pitchiqPhysics(p, fThis, mins);
    var result = ppg*0.45 + phys2*0.55;
    return Math.max(Math.round(result * avail * 10) / 10, 0);
  }
}
