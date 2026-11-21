import {byId,metersPerUnit as unit} from './world.mjs?v=83fdd04';

const office=byId.get('office');
const angle=office.viewHeading;
export const officeDoor={depth:6.17,halfLeaf:.83,travel:1.72,seconds:.6,heading:angle-Math.PI/2};
export function officePoint(side=0,depth=officeDoor.depth){
  return {
    x:office.x+(side*Math.sin(angle)+depth*Math.cos(angle))/unit,
    y:office.y+(-side*Math.cos(angle)+depth*Math.sin(angle))/unit,
  };
}
export const officeEntry=officePoint(0,officeDoor.depth+1.5);
const threshold=officePoint();
export function nearOfficeDoor(player,meters){
  return Math.hypot(player.x-threshold.x,player.y-threshold.y)*unit<=meters;
}
export function officeLeaf(side,progress){
  return officePoint(side*(officeDoor.halfLeaf+officeDoor.travel*progress));
}
