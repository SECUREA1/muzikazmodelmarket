/** Timing is measured by the room server. These rules also drive the practice HUD. */
export const FITNESS_CUE_COUNT=12;
export const FITNESS_COUNTDOWN_MS=2200;
export const FITNESS_DAILY_REWARD_CAP=300;
export const FITNESS_REWARD_COOLDOWN_MS=15000;
export const FITNESS_GAMES=Object.freeze({
 boxing:{inputs:['jab','cross','duck'],labels:{jab:'Jab',cross:'Cross',duck:'Duck'},intervalMs:1400,windowMs:430,rewardMzk:35,skill:'coordination',instructions:'Read the combination. Jab, cross or duck as the marker reaches the centre.'},
 'bench-press':{inputs:['press'],labels:{press:'Press'},intervalMs:1600,windowMs:410,rewardMzk:30,skill:'strength',instructions:'Press once as the bar reaches the green window. Smooth, controlled reps build your streak.'},
 deadlift:{inputs:['lift'],labels:{lift:'Lift'},intervalMs:1800,windowMs:390,rewardMzk:35,skill:'strength',instructions:'Brace, wait for the centre, then lift. Every rep rewards precision over speed.'},
 agility:{inputs:['left','up','right','down'],labels:{left:'Left',up:'Forward',right:'Right',down:'Back'},intervalMs:1150,windowMs:380,rewardMzk:28,skill:'agility',instructions:'Follow the changing direction. Hit the matching arrow when the marker reaches the centre.'},
 'jump-rope':{inputs:['jump'],labels:{jump:'Jump'},intervalMs:1050,windowMs:330,rewardMzk:25,skill:'rhythm',instructions:'Jump on each beat. Keep a steady cadence to build a clean streak.'},
 rowing:{inputs:['pull','recover'],labels:{pull:'Pull',recover:'Recover'},intervalMs:1450,windowMs:420,rewardMzk:30,skill:'endurance',instructions:'Alternate a strong pull with a calm recovery, matching each cue at the centre.'},
 balance:{inputs:['left','right'],labels:{left:'Left',right:'Right'},intervalMs:1350,windowMs:380,rewardMzk:25,skill:'balance',instructions:'Read each correction and shift left or right in the centre window.'},
 'boxing-sparring':{competition:true,rounds:3,exchangesPerRound:4,inputs:['jab','cross','guard','slip'],labels:{jab:'Jab',cross:'Cross',guard:'Guard',slip:'Slip'},intervalMs:1900,windowMs:430,rewardMzk:40,skill:'boxing',instructions:'Fight three controlled rounds. Time jabs and crosses to score; guard or slip the announced attack to deny your opponent a counter.'},
 basketball:{competition:true,rounds:4,exchangesPerRound:3,inputs:['aim-left','aim-right','shoot'],labels:{'aim-left':'Aim left','aim-right':'Aim right',shoot:'Shoot'},intervalMs:1550,windowMs:410,rewardMzk:35,skill:'basketball',instructions:'Four shots, three cues each. Set your aim left and right, then release on the target. Clean setup improves your chance of scoring.'},
 'table-tennis':{competition:true,rounds:3,exchangesPerRound:4,inputs:['forehand','backhand','smash'],labels:{forehand:'Forehand',backhand:'Backhand',smash:'Smash'},intervalMs:1250,windowMs:370,rewardMzk:35,skill:'table-tennis',instructions:'Read the return and meet the ball with the correct stroke. Precise returns and smashes win rally points.'},
 sprint:{competition:true,rounds:3,exchangesPerRound:4,inputs:['left','right','hurdle'],labels:{left:'Left drive',right:'Right drive',hurdle:'Clear hurdle'},intervalMs:1150,windowMs:360,rewardMzk:35,skill:'sprint',instructions:'Alternate your stride and time the hurdle cues. Keep clean splits to cover more distance than your AI rival.'}
});
export function fitnessInputPoints(offsetMs,windowMs){const offset=Math.abs(offsetMs);return offset>windowMs?0:offset<=140?100:offset<=windowMs*.68?70:40;}
export function fitnessMedal(score,maxScore=FITNESS_CUE_COUNT*100){const ratio=score/maxScore;return ratio>=.85?'Gold':ratio>=.65?'Silver':ratio>=.4?'Bronze':'Practice';}
export function fitnessRoundReward(kind,score){const rules=FITNESS_GAMES[kind];return !rules||!Number.isSafeInteger(score)||score<480||score>FITNESS_CUE_COUNT*100?0:Math.floor(rules.rewardMzk*score/(FITNESS_CUE_COUNT*100));}
