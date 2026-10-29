/* Shared inspection wording for the same light field used by crystal damage. */
import {illuminationAt,sunLightStrength,LIGHT_MAX} from '../core/index.js';
import {t} from '../i18n/i18n.js';
export function describeLight(s,x,y,z,protectedInterior=false) {
 const light=illuminationAt(s,x,y,z),sky=light.sky*sunLightStrength(s)>0,block=light.block>0;
 const source=sky&&block?'both':sky?'sky':block?'artificial':'dark';
 const outside=t('light.level',{n:Math.round(light.level*10)/10,max:LIGHT_MAX})+' · '+t('light.'+source);
 return protectedInterior?t('light.protected')+' · '+outside:outside;
}
