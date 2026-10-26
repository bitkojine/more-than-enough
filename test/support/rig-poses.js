// Every way Mica can be posed, for the clip sweep (test/unit/rig-clips.test.js).
// Each entry is a draw() option set. Quick mode samples coarsely; the full
// sweep (RIG_SWEEP=full) walks every step.
const ACTIONS=[
 ['swing',{pickaxe:6}],['pick',{basket:5,pickaxe:6}],['pick',{pickaxe:6}],['pick',{work:'plant',pickaxe:6}],['build',{pickaxe:6}],
 ['collect',{pickaxe:6}],['collect',{work:'lantern',lantern:true,pickaxe:6}],['cheer',{pickaxe:6}],['up',{pickaxe:6}],['down',{pickaxe:6}],
 // With a basket on the back the stowed pickaxe stands in it and the lantern hooks onto it.
 ...['build','collect','cheer','up','down'].map(a=>[a,{pickaxe:6,basket:5}]),['pick',{work:'plant',pickaxe:6,basket:5}]
];
const GEAR={pickaxe:6,basket:5,lantern:true,lanternOn:true};
export function rigPoses({full=false}={}){
 const steps=n=>Array.from({length:n+1},(_,i)=>i/n),poses=[];
 const progress=steps(full?24:8),phases=steps(full?16:8).slice(0,-1);
 // Facings between the eight sectors twist the spine during work.
 const facings=full?[{x:0,y:1},{x:1,y:.41},{x:1,y:-.41},{x:-.41,y:1}]:[{x:0,y:1},{x:1,y:.41}];
 const wiki={look:{x:1,y:0},talk:.3};
 for(const phase of phases){
  poses.push({...GEAR,walking:true,phase,wiki});
  poses.push({...GEAR,blend:.5,phase});
  for(const cargo of ['specimen','sealed'])poses.push({...GEAR,walking:true,phase,cargo});
 }
 for(const [action,gear]of ACTIONS)for(const p of progress)for(const facing of facings)poses.push({...gear,action,progress:p,facing,wiki,lantern:true});
 for(const level of [1,2,3,4,5,6]){poses.push({pickaxe:level});poses.push({pickaxe:level,action:'swing',progress:.32});}
 for(const time of steps(full?12:4))poses.push({...GEAR,time:time*9,steady:time>.5});
 // Wiki breathes and blinks on its own clock, so sweep a whole cycle of it.
 for(const time of steps(full?40:10))for(const look of [null,{x:1,y:0}])poses.push({time:time*4.3,wiki:{look,rest:look===null}});
 for(const fold of [0,.5,1])for(const look of [null,{x:1,y:0},{x:-1,y:-1},{x:0,y:-1}])poses.push({...GEAR,wiki:{fold,look,talk:.2}});
 return poses;
}
