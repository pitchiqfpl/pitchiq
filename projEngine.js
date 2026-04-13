/**
 * projEngine.js - PitchIQ shared projection engine
 * Single source of truth for expected points across all tools.
 *
 * DGW support: gwIndex maps to unique GW numbers, not array positions.
 * For a DGW player with two fixtures in GW33 then GW34:
 *   gwIndex=0 -> GW33 (sums both fixtures)
 *   gwIndex=1 -> GW34 (single fixture)
 *
 * xG blend: 70% recent + 30% season
 * CS uses both oppXg (opponent attack) and teamXgc (own defence)
 */

function pitchiqPhysics(p, fix, mins) {
  if (!fix) return 0;
  var mf  = Math.min((mins || 75) / 90, 1);
  var pos = p.pos;
  var app = (mins || 75) >= 60 ? 2 : 1;

  var oppXg  = fix.oppXg  != null ? fix.oppXg  : [0,0.7,1.0,1.3,1.6,2.0][fix.diff != null ? fix.diff : 3];
  var oppXgc = fix.oppXgc != null ? fix.oppXgc : [0,1.8,1.5,1.25,1.0,0.7][fix.diff != null ? fix.diff : 3];
  var teamXgc = fix.teamXgc != null ? fix.teamXgc : 1.25;
  var teamDefFactor = Math.max(0.5, Math.min(teamXgc / 1.25, 2.0));
  var effectiveThreat = oppXg * teamDefFactor;
  var oppDef = Math.max(0.45, Math.min(oppXgc / 1.25, 2.2));

  var l6 = (typeof L6_CACHE !== 'undefined') ? L6_CACHE.get(p.id) : null;
  var pXgRecent = (l6 && l6.xg90L6) ? l6.xg90L6 : (p.xg90Recent || 0);
  var pXaRecent = (l6 && l6.xa90L6) ? l6.xa90L6 : (p.xa90Recent || 0);
  var pXg = pXgRecent > 0.01 ? Math.min((p.xg90||0)*0.30 + pXgRecent*0.70, 1.2) : (p.xg90||0);
  var pXa = pXaRecent > 0.01 ? Math.min((p.xa90||0)*0.30 + pXaRecent*0.70, 0.9) : (p.xa90||0);

  var goalPts = pos==='FWD' ? 4 : pos==='MID' ? 5 : 6;
  var attPts  = (pXg * oppDef * goalPts + pXa * oppDef * 3) * mf;
  var setPiece = p.isPenTaker ? 0.7 * mf : 0;
  var csProb  = Math.exp(-Math.max(effectiveThreat * mf, 0.01));
  var csPer   = (pos==='GK'||pos==='DEF') ? 4 : pos==='MID' ? 1 : 0;
  var csPts   = csProb * csPer * ((mins||75) >= 60 ? 1.0 : 0.5);
  var savePts = pos==='GK' ? (effectiveThreat * 2.5 * mf) / 3 : 0;

  return app + attPts + setPiece + csPts + savePts;
}

function pitchiqProj(p, gwIndex) {
  if (!p.fixes || !p.fixes.length) return 0;

  var chanceNext = p.chanceNext != null ? p.chanceNext : 100;
  var avail = chanceNext < 100 ? chanceNext/100
            : p.status==='i' ? 0
            : p.status==='d' ? 0.55
            : 1;

  var mins = p.minsRel != null ? p.minsRel : 75;
  var mf   = Math.min(mins/90, 1);
  var pos  = p.pos;

  // Map gwIndex to unique GW numbers (handles DGW)
  // e.g. fixes = [{gw:33},{gw:33},{gw:34}] -> uniqueGws = [33,34]
  // gwIndex=0 -> gw33 (2 fixtures), gwIndex=1 -> gw34 (1 fixture)
  var seen = {};
  var uniqueGws = [];
  p.fixes.forEach(function(f) {
    if (!seen[f.gw]) { seen[f.gw] = true; uniqueGws.push(f.gw); }
  });

  var targetGw = uniqueGws[gwIndex];
  if (targetGw == null) return 0;

  // All fixtures for this GW (1 for normal, 2 for DGW)
  var gwFixes = p.fixes.filter(function(f) { return f.gw === targetGw; });

  var epCaps   = {GK:7.5, DEF:9.0, MID:12.0, FWD:11.0};
  var epCapped = p.epNext > 0 ? Math.min(p.epNext, epCaps[pos]||12.0) : 0;
  var ppgDef   = (pos==='GK'||pos==='DEF') ? 4.5 : 5.0;
  var ppg      = p.ppg > 0 ? p.ppg : ppgDef;

  // Sum projected pts across all fixtures in this GW
  var total = 0;
  gwFixes.forEach(function(fix) {
    var singlePts;
    if (gwIndex === 0) {
      var phys = pitchiqPhysics(p, fix, mins);
      var wPhys, wEp, wPpg;
      if (pos==='GK'||pos==='DEF') { wPhys=0.50; wEp=0.40; wPpg=0.10; }
      else                          { wPhys=0.40; wEp=0.45; wPpg=0.15; }
      singlePts = Math.max((phys*wPhys + epCapped*wEp + ppg*wPpg) * mf * avail, 0);
    } else {
      var phys2 = pitchiqPhysics(p, fix, mins);
      singlePts = Math.max((ppg*0.45 + phys2*0.55) * avail, 0);
    }
    total += singlePts;
  });

  return Math.round(total * 10) / 10;
}

/* ── SHARED FIXTURE MAP BUILDER ──────────────────────────────────────────────
   Builds enriched fixture objects with oppXg/oppXgc/teamXgc for all tools.
   Call this instead of local buildFixMap to get consistent physics inputs.
   
   Usage:
     const fm = pitchiqBuildFixMap(fixtures, gw, TMAP, bs, xgData);
     // fm[teamId] = [{gw, opp, ha, diff, oppXg, oppXgc, teamXgc}, ...]
──────────────────────────────────────────────────────────────────────────── */
function pitchiqBuildFixMap(fixtures, gw, tmap, bs, xgData) {
  var m = {};
  if (!Array.isArray(fixtures)) return m;

  // Build team strength map from xg-data or FPL strength ratings
  var teamStr = {};
  var W_SEASON = 0.60, W_FORM = 0.40, HOME_ATT = 1.10, HOME_DEF = 0.88;

  function fplStr2Xg(s) { return 0.8 + (((s||1100) - 1000) / 400) * 1.2; }

  if (xgData && xgData.teams && Object.keys(xgData.teams).length > 0) {
    var fplList = (bs&&bs.teams||[]).map(function(t) {
      return {id:t.id, name:t.name.toLowerCase().replace(/[^a-z0-9]/g,'')};
    });
    Object.values(xgData.teams).forEach(function(x) {
      var xc = x.name.toLowerCase().replace(/[^a-z0-9]/g,'');
      var match = fplList.find(function(f) { return f.name===xc||f.name.includes(xc)||xc.includes(f.name); });
      if (match && !teamStr[match.id]) {
        var bA = x.xg_season*W_SEASON + (x.xg_last5||x.xg_season)*W_FORM;
        var bD = x.xgc_season*W_SEASON + (x.xgc_last5||x.xgc_season)*W_FORM;
        teamStr[match.id] = {
          xgH:bA*HOME_ATT, xgA:bA/HOME_ATT,
          xgcH:bD*HOME_DEF, xgcA:bD/HOME_DEF
        };
      }
    });
  }

  // Fallback: FPL strength ratings
  if (bs && bs.teams) {
    bs.teams.forEach(function(t) {
      if (teamStr[t.id]) return;
      var sAH=t.strength_attack_home||1100, sAA=t.strength_attack_away||1100;
      var sDH=t.strength_defence_home||1100, sDA=t.strength_defence_away||1100;
      teamStr[t.id] = {
        xgH:Math.max(0.6,Math.min(fplStr2Xg(sAH)*HOME_ATT,2.5)),
        xgA:Math.max(0.5,Math.min(fplStr2Xg(sAA)/HOME_ATT,2.2)),
        xgcH:Math.max(0.5,Math.min(fplStr2Xg(sDH)*HOME_DEF,2.5)),
        xgcA:Math.max(0.6,Math.min(fplStr2Xg(sDA)/HOME_DEF,2.8))
      };
    });
  }

  var upcoming = fixtures.filter(function(f) { return f.event >= gw && !f.finished; });
  upcoming.forEach(function(f) {
    [f.team_h, f.team_a].forEach(function(tid) {
      if (!m[tid]) m[tid] = [];
      var isHome = tid === f.team_h;
      var oppId  = isHome ? f.team_a : f.team_h;
      var oppStr = teamStr[oppId] || {xgH:1.25,xgA:1.1,xgcH:1.25,xgcA:1.35};
      var myStr  = teamStr[tid]   || {xgH:1.25,xgA:1.1,xgcH:1.25,xgcA:1.35};
      m[tid].push({
        gw:      f.event,
        opp:     (tmap && tmap[oppId]) ? (tmap[oppId].short||tmap[oppId]) : '?',
        ha:      isHome ? 'H' : 'A',
        diff:    isHome ? (f.team_h_difficulty||3) : (f.team_a_difficulty||3),
        oppXg:   isHome ? oppStr.xgA  : oppStr.xgH,
        oppXgc:  isHome ? oppStr.xgcA : oppStr.xgcH,
        teamXgc: isHome ? myStr.xgcH  : myStr.xgcA,
      });
    });
  });

  Object.values(m).forEach(function(a) { a.sort(function(x,y){return x.gw-y.gw;}); });
  return m;
}
