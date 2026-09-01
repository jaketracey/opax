function Fa(i){return i.length>34?`${i.slice(0,32)}\u2026`:i}function $n(i){let t=Math.abs(i);return t>=1e9?`$${(i/1e9).toFixed(1)}b`:t>=1e6?`$${(i/1e6).toFixed(1)}m`:t>=1e3?`$${Math.round(i/1e3)}k`:`$${Math.round(i)}`}function Oa(i,t){let e=Math.max(0,t);return i==="links"?Math.min(26,5.5+3.6*Math.sqrt(e)):Math.max(7,Math.min(26,6+5.2*Math.log10(1+e)))}function Ba(i){let t=new Map;for(let e of i)t.set(e.source,(t.get(e.source)??0)+1),t.set(e.target,(t.get(e.target)??0)+1);return t}var Hl=0,vo=1,Wl=2;var Ms=1,Xl=2,zi=3,Sn=0,Ee=1,Ze=2,fn=0,ni=1,yo=2,Mo=3,bo=4,ql=5;var On=100,Yl=101,Zl=102,$l=103,Jl=104,Kl=200,Ql=201,jl=202,tc=203,rr=204,ar=205,ec=206,nc=207,ic=208,sc=209,rc=210,ac=211,oc=212,lc=213,cc=214,or=0,lr=1,cr=2,ii=3,hr=4,ur=5,dr=6,fr=7,So=0,hc=1,uc=2,nn=0,Eo=1,wo=2,To=3,Ao=4,Co=5,Ro=6,Io=7;var Po=300,Hn=301,ri=302,Or=303,Br=304,bs=306,pr=1e3,hn=1001,mr=1002,Me=1003,dc=1004;var Ss=1005;var Se=1006,zr=1007;var Wn=1008;var Ne=1009,Lo=1010,Do=1011,Vi=1012,Vr=1013,sn=1014,rn=1015,pn=1016,kr=1017,Gr=1018,ki=1020,No=35902,Uo=35899,Fo=1021,Oo=1022,$e=1023,un=1026,Xn=1027,Bo=1028,Hr=1029,qn=1030,Wr=1031;var Xr=1033,Es=33776,ws=33777,Ts=33778,As=33779,qr=35840,Yr=35841,Zr=35842,$r=35843,Jr=36196,Kr=37492,Qr=37496,jr=37488,ta=37489,Cs=37490,ea=37491,na=37808,ia=37809,sa=37810,ra=37811,aa=37812,oa=37813,la=37814,ca=37815,ha=37816,ua=37817,da=37818,fa=37819,pa=37820,ma=37821,ga=36492,xa=36494,_a=36495,va=36283,ya=36284,Rs=36285,Ma=36286;var ts=2300,gr=2301,sr=2302,oo=2303,lo=2400,co=2401,ho=2402;var fc=3200;var ba=0,pc=1,Tn="",Be="srgb",es="srgb-linear",ns="linear",qt="srgb";var ti=7680;var uo=519,mc=512,gc=513,xc=514,Sa=515,_c=516,vc=517,Ea=518,yc=519,fo=35044;var zo="300 es",je=2e3,Ai=2001;function xh(i){for(let t=i.length-1;t>=0;--t)if(i[t]>=65535)return!0;return!1}function _h(i){return ArrayBuffer.isView(i)&&!(i instanceof DataView)}function is(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function Mc(){let i=is("canvas");return i.style.display="block",i}var yl={},Ci=null;function Vo(...i){let t="THREE."+i.shift();Ci?Ci("log",t,...i):console.log(t,...i)}function bc(i){let t=i[0];if(typeof t=="string"&&t.startsWith("TSL:")){let e=i[1];e&&e.isStackTrace?i[0]+=" "+e.getLocation():i[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return i}function wt(...i){i=bc(i);let t="THREE."+i.shift();if(Ci)Ci("warn",t,...i);else{let e=i[0];e&&e.isStackTrace?console.warn(e.getError(t)):console.warn(t,...i)}}function Ct(...i){i=bc(i);let t="THREE."+i.shift();if(Ci)Ci("error",t,...i);else{let e=i[0];e&&e.isStackTrace?console.error(e.getError(t)):console.error(t,...i)}}function ei(...i){let t=i.join(" ");t in yl||(yl[t]=!0,wt(...i))}function Sc(i,t,e){return new Promise(function(n,s){function r(){switch(i.clientWaitSync(t,i.SYNC_FLUSH_COMMANDS_BIT,0)){case i.WAIT_FAILED:s();break;case i.TIMEOUT_EXPIRED:setTimeout(r,e);break;default:n()}}setTimeout(r,e)})}var Ec={[or]:lr,[cr]:dr,[hr]:fr,[ii]:ur,[lr]:or,[dr]:cr,[fr]:hr,[ur]:ii},dn=class{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){let n=this._listeners;return n===void 0?!1:n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){let n=this._listeners;if(n===void 0)return;let s=n[t];if(s!==void 0){let r=s.indexOf(e);r!==-1&&s.splice(r,1)}}dispatchEvent(t){let e=this._listeners;if(e===void 0)return;let n=e[t.type];if(n!==void 0){t.target=this;let s=n.slice(0);for(let r=0,a=s.length;r<a;r++)s[r].call(this,t);t.target=null}}},Te=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],Ml=1234567,Qi=Math.PI/180,Ri=180/Math.PI;function Gi(){let i=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(Te[i&255]+Te[i>>8&255]+Te[i>>16&255]+Te[i>>24&255]+"-"+Te[t&255]+Te[t>>8&255]+"-"+Te[t>>16&15|64]+Te[t>>24&255]+"-"+Te[e&63|128]+Te[e>>8&255]+"-"+Te[e>>16&255]+Te[e>>24&255]+Te[n&255]+Te[n>>8&255]+Te[n>>16&255]+Te[n>>24&255]).toLowerCase()}function Gt(i,t,e){return Math.max(t,Math.min(e,i))}function ko(i,t){return(i%t+t)%t}function vh(i,t,e,n,s){return n+(i-t)*(s-n)/(e-t)}function yh(i,t,e){return i!==t?(e-i)/(t-i):0}function ji(i,t,e){return(1-e)*i+e*t}function Mh(i,t,e,n){return ji(i,t,1-Math.exp(-e*n))}function bh(i,t=1){return t-Math.abs(ko(i,t*2)-t)}function Sh(i,t,e){return i<=t?0:i>=e?1:(i=(i-t)/(e-t),i*i*(3-2*i))}function Eh(i,t,e){return i<=t?0:i>=e?1:(i=(i-t)/(e-t),i*i*i*(i*(i*6-15)+10))}function wh(i,t){return i+Math.floor(Math.random()*(t-i+1))}function Th(i,t){return i+Math.random()*(t-i)}function Ah(i){return i*(.5-Math.random())}function Ch(i){i!==void 0&&(Ml=i);let t=Ml+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}function Rh(i){return i*Qi}function Ih(i){return i*Ri}function Ph(i){return(i&i-1)===0&&i!==0}function Lh(i){return Math.pow(2,Math.ceil(Math.log(i)/Math.LN2))}function Dh(i){return Math.pow(2,Math.floor(Math.log(i)/Math.LN2))}function Nh(i,t,e,n,s){let r=Math.cos,a=Math.sin,o=r(e/2),c=a(e/2),l=r((t+n)/2),u=a((t+n)/2),d=r((t-n)/2),h=a((t-n)/2),p=r((n-t)/2),g=a((n-t)/2);switch(s){case"XYX":i.set(o*u,c*d,c*h,o*l);break;case"YZY":i.set(c*h,o*u,c*d,o*l);break;case"ZXZ":i.set(c*d,c*h,o*u,o*l);break;case"XZX":i.set(o*u,c*g,c*p,o*l);break;case"YXY":i.set(c*p,o*u,c*g,o*l);break;case"ZYZ":i.set(c*g,c*p,o*u,o*l);break;default:wt("MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+s)}}function wi(i,t){switch(t.constructor){case Float32Array:return i;case Uint32Array:return i/4294967295;case Uint16Array:return i/65535;case Uint8Array:return i/255;case Int32Array:return Math.max(i/2147483647,-1);case Int16Array:return Math.max(i/32767,-1);case Int8Array:return Math.max(i/127,-1);default:throw new Error("THREE.MathUtils: Invalid component type.")}}function Pe(i,t){switch(t.constructor){case Float32Array:return i;case Uint32Array:return Math.round(i*4294967295);case Uint16Array:return Math.round(i*65535);case Uint8Array:return Math.round(i*255);case Int32Array:return Math.round(i*2147483647);case Int16Array:return Math.round(i*32767);case Int8Array:return Math.round(i*127);default:throw new Error("THREE.MathUtils: Invalid component type.")}}var ai={DEG2RAD:Qi,RAD2DEG:Ri,generateUUID:Gi,clamp:Gt,euclideanModulo:ko,mapLinear:vh,inverseLerp:yh,lerp:ji,damp:Mh,pingpong:bh,smoothstep:Sh,smootherstep:Eh,randInt:wh,randFloat:Th,randFloatSpread:Ah,seededRandom:Ch,degToRad:Rh,radToDeg:Ih,isPowerOfTwo:Ph,ceilPowerOfTwo:Lh,floorPowerOfTwo:Dh,setQuaternionFromProperEuler:Nh,normalize:Pe,denormalize:wi},Ut=class i{static{i.prototype.isVector2=!0}constructor(t=0,e=0){this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("THREE.Vector2: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){let e=this.x,n=this.y,s=t.elements;return this.x=s[0]*e+s[3]*n+s[6],this.y=s[1]*e+s[4]*n+s[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=Gt(this.x,t.x,e.x),this.y=Gt(this.y,t.y,e.y),this}clampScalar(t,e){return this.x=Gt(this.x,t,e),this.y=Gt(this.y,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Gt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(Gt(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){let n=Math.cos(e),s=Math.sin(e),r=this.x-t.x,a=this.y-t.y;return this.x=r*n-a*s+t.x,this.y=r*s+a*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},Ye=class{constructor(t=0,e=0,n=0,s=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=s}static slerpFlat(t,e,n,s,r,a,o){let c=n[s+0],l=n[s+1],u=n[s+2],d=n[s+3],h=r[a+0],p=r[a+1],g=r[a+2],y=r[a+3];if(d!==y||c!==h||l!==p||u!==g){let m=c*h+l*p+u*g+d*y;m<0&&(h=-h,p=-p,g=-g,y=-y,m=-m);let f=1-o;if(m<.9995){let w=Math.acos(m),A=Math.sin(w);f=Math.sin(f*w)/A,o=Math.sin(o*w)/A,c=c*f+h*o,l=l*f+p*o,u=u*f+g*o,d=d*f+y*o}else{c=c*f+h*o,l=l*f+p*o,u=u*f+g*o,d=d*f+y*o;let w=1/Math.sqrt(c*c+l*l+u*u+d*d);c*=w,l*=w,u*=w,d*=w}}t[e]=c,t[e+1]=l,t[e+2]=u,t[e+3]=d}static multiplyQuaternionsFlat(t,e,n,s,r,a){let o=n[s],c=n[s+1],l=n[s+2],u=n[s+3],d=r[a],h=r[a+1],p=r[a+2],g=r[a+3];return t[e]=o*g+u*d+c*p-l*h,t[e+1]=c*g+u*h+l*d-o*p,t[e+2]=l*g+u*p+o*h-c*d,t[e+3]=u*g-o*d-c*h-l*p,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,s){return this._x=t,this._y=e,this._z=n,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){let n=t._x,s=t._y,r=t._z,a=t._order,o=Math.cos,c=Math.sin,l=o(n/2),u=o(s/2),d=o(r/2),h=c(n/2),p=c(s/2),g=c(r/2);switch(a){case"XYZ":this._x=h*u*d+l*p*g,this._y=l*p*d-h*u*g,this._z=l*u*g+h*p*d,this._w=l*u*d-h*p*g;break;case"YXZ":this._x=h*u*d+l*p*g,this._y=l*p*d-h*u*g,this._z=l*u*g-h*p*d,this._w=l*u*d+h*p*g;break;case"ZXY":this._x=h*u*d-l*p*g,this._y=l*p*d+h*u*g,this._z=l*u*g+h*p*d,this._w=l*u*d-h*p*g;break;case"ZYX":this._x=h*u*d-l*p*g,this._y=l*p*d+h*u*g,this._z=l*u*g-h*p*d,this._w=l*u*d+h*p*g;break;case"YZX":this._x=h*u*d+l*p*g,this._y=l*p*d+h*u*g,this._z=l*u*g-h*p*d,this._w=l*u*d-h*p*g;break;case"XZY":this._x=h*u*d-l*p*g,this._y=l*p*d-h*u*g,this._z=l*u*g+h*p*d,this._w=l*u*d+h*p*g;break;default:wt("Quaternion: .setFromEuler() encountered an unknown order: "+a)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){let n=e/2,s=Math.sin(n);return this._x=t.x*s,this._y=t.y*s,this._z=t.z*s,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){let e=t.elements,n=e[0],s=e[4],r=e[8],a=e[1],o=e[5],c=e[9],l=e[2],u=e[6],d=e[10],h=n+o+d;if(h>0){let p=.5/Math.sqrt(h+1);this._w=.25/p,this._x=(u-c)*p,this._y=(r-l)*p,this._z=(a-s)*p}else if(n>o&&n>d){let p=2*Math.sqrt(1+n-o-d);this._w=(u-c)/p,this._x=.25*p,this._y=(s+a)/p,this._z=(r+l)/p}else if(o>d){let p=2*Math.sqrt(1+o-n-d);this._w=(r-l)/p,this._x=(s+a)/p,this._y=.25*p,this._z=(c+u)/p}else{let p=2*Math.sqrt(1+d-n-o);this._w=(a-s)/p,this._x=(r+l)/p,this._y=(c+u)/p,this._z=.25*p}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<1e-8?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(Gt(this.dot(t),-1,1)))}rotateTowards(t,e){let n=this.angleTo(t);if(n===0)return this;let s=Math.min(1,e/n);return this.slerp(t,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){let n=t._x,s=t._y,r=t._z,a=t._w,o=e._x,c=e._y,l=e._z,u=e._w;return this._x=n*u+a*o+s*l-r*c,this._y=s*u+a*c+r*o-n*l,this._z=r*u+a*l+n*c-s*o,this._w=a*u-n*o-s*c-r*l,this._onChangeCallback(),this}slerp(t,e){let n=t._x,s=t._y,r=t._z,a=t._w,o=this.dot(t);o<0&&(n=-n,s=-s,r=-r,a=-a,o=-o);let c=1-e;if(o<.9995){let l=Math.acos(o),u=Math.sin(l);c=Math.sin(c*l)/u,e=Math.sin(e*l)/u,this._x=this._x*c+n*e,this._y=this._y*c+s*e,this._z=this._z*c+r*e,this._w=this._w*c+a*e,this._onChangeCallback()}else this._x=this._x*c+n*e,this._y=this._y*c+s*e,this._z=this._z*c+r*e,this._w=this._w*c+a*e,this.normalize();return this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){let t=2*Math.PI*Math.random(),e=2*Math.PI*Math.random(),n=Math.random(),s=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(s*Math.sin(t),s*Math.cos(t),r*Math.sin(e),r*Math.cos(e))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},N=class i{static{i.prototype.isVector3=!0}constructor(t=0,e=0,n=0){this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("THREE.Vector3: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(bl.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(bl.setFromAxisAngle(t,e))}applyMatrix3(t){let e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[3]*n+r[6]*s,this.y=r[1]*e+r[4]*n+r[7]*s,this.z=r[2]*e+r[5]*n+r[8]*s,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){let e=this.x,n=this.y,s=this.z,r=t.elements,a=1/(r[3]*e+r[7]*n+r[11]*s+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*s+r[12])*a,this.y=(r[1]*e+r[5]*n+r[9]*s+r[13])*a,this.z=(r[2]*e+r[6]*n+r[10]*s+r[14])*a,this}applyQuaternion(t){let e=this.x,n=this.y,s=this.z,r=t.x,a=t.y,o=t.z,c=t.w,l=2*(a*s-o*n),u=2*(o*e-r*s),d=2*(r*n-a*e);return this.x=e+c*l+a*d-o*u,this.y=n+c*u+o*l-r*d,this.z=s+c*d+r*u-a*l,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){let e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*s,this.y=r[1]*e+r[5]*n+r[9]*s,this.z=r[2]*e+r[6]*n+r[10]*s,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=Gt(this.x,t.x,e.x),this.y=Gt(this.y,t.y,e.y),this.z=Gt(this.z,t.z,e.z),this}clampScalar(t,e){return this.x=Gt(this.x,t,e),this.y=Gt(this.y,t,e),this.z=Gt(this.z,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Gt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){let n=t.x,s=t.y,r=t.z,a=e.x,o=e.y,c=e.z;return this.x=s*c-r*o,this.y=r*a-n*c,this.z=n*o-s*a,this}projectOnVector(t){let e=t.lengthSq();if(e===0)return this.set(0,0,0);let n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return za.copy(this).projectOnVector(t),this.sub(za)}reflect(t){return this.sub(za.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(Gt(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y,s=this.z-t.z;return e*e+n*n+s*s}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){let s=Math.sin(e)*t;return this.x=s*Math.sin(n),this.y=Math.cos(e)*t,this.z=s*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){let e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),s=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=s,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let t=Math.random()*Math.PI*2,e=Math.random()*2-1,n=Math.sqrt(1-e*e);return this.x=n*Math.cos(t),this.y=e,this.z=n*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},za=new N,bl=new Ye,It=class i{static{i.prototype.isMatrix3=!0}constructor(t,e,n,s,r,a,o,c,l){this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,a,o,c,l)}set(t,e,n,s,r,a,o,c,l){let u=this.elements;return u[0]=t,u[1]=s,u[2]=o,u[3]=e,u[4]=r,u[5]=c,u[6]=n,u[7]=a,u[8]=l,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){let e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,s=e.elements,r=this.elements,a=n[0],o=n[3],c=n[6],l=n[1],u=n[4],d=n[7],h=n[2],p=n[5],g=n[8],y=s[0],m=s[3],f=s[6],w=s[1],A=s[4],M=s[7],T=s[2],b=s[5],C=s[8];return r[0]=a*y+o*w+c*T,r[3]=a*m+o*A+c*b,r[6]=a*f+o*M+c*C,r[1]=l*y+u*w+d*T,r[4]=l*m+u*A+d*b,r[7]=l*f+u*M+d*C,r[2]=h*y+p*w+g*T,r[5]=h*m+p*A+g*b,r[8]=h*f+p*M+g*C,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],a=t[4],o=t[5],c=t[6],l=t[7],u=t[8];return e*a*u-e*o*l-n*r*u+n*o*c+s*r*l-s*a*c}invert(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],a=t[4],o=t[5],c=t[6],l=t[7],u=t[8],d=u*a-o*l,h=o*c-u*r,p=l*r-a*c,g=e*d+n*h+s*p;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);let y=1/g;return t[0]=d*y,t[1]=(s*l-u*n)*y,t[2]=(o*n-s*a)*y,t[3]=h*y,t[4]=(u*e-s*c)*y,t[5]=(s*r-o*e)*y,t[6]=p*y,t[7]=(n*c-l*e)*y,t[8]=(a*e-n*r)*y,this}transpose(){let t,e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){let e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,s,r,a,o){let c=Math.cos(r),l=Math.sin(r);return this.set(n*c,n*l,-n*(c*a+l*o)+a+t,-s*l,s*c,-s*(-l*a+c*o)+o+e,0,0,1),this}scale(t,e){return ei("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(Va.makeScale(t,e)),this}rotate(t){return ei("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(Va.makeRotation(-t)),this}translate(t,e){return ei("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(Va.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){let e=this.elements,n=t.elements;for(let s=0;s<9;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}},Va=new It,Sl=new It().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),El=new It().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function Uh(){let i={enabled:!0,workingColorSpace:es,spaces:{},convert:function(s,r,a){return this.enabled===!1||r===a||!r||!a||(this.spaces[r].transfer===qt&&(s.r=bn(s.r),s.g=bn(s.g),s.b=bn(s.b)),this.spaces[r].primaries!==this.spaces[a].primaries&&(s.applyMatrix3(this.spaces[r].toXYZ),s.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===qt&&(s.r=Ti(s.r),s.g=Ti(s.g),s.b=Ti(s.b))),s},workingToColorSpace:function(s,r){return this.convert(s,this.workingColorSpace,r)},colorSpaceToWorking:function(s,r){return this.convert(s,r,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===Tn?ns:this.spaces[s].transfer},getToneMappingMode:function(s){return this.spaces[s].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(s,r=this.workingColorSpace){return s.fromArray(this.spaces[r].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,r,a){return s.copy(this.spaces[r].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(s,r){return ei("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),i.workingToColorSpace(s,r)},toWorkingColorSpace:function(s,r){return ei("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),i.colorSpaceToWorking(s,r)}},t=[.64,.33,.3,.6,.15,.06],e=[.2126,.7152,.0722],n=[.3127,.329];return i.define({[es]:{primaries:t,whitePoint:n,transfer:ns,toXYZ:Sl,fromXYZ:El,luminanceCoefficients:e,workingColorSpaceConfig:{unpackColorSpace:Be},outputColorSpaceConfig:{drawingBufferColorSpace:Be}},[Be]:{primaries:t,whitePoint:n,transfer:qt,toXYZ:Sl,fromXYZ:El,luminanceCoefficients:e,outputColorSpaceConfig:{drawingBufferColorSpace:Be}}}),i}var kt=Uh();function bn(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function Ti(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}var fi,xr=class{static getDataURL(t,e="image/png"){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let n;if(t instanceof HTMLCanvasElement)n=t;else{fi===void 0&&(fi=is("canvas")),fi.width=t.width,fi.height=t.height;let s=fi.getContext("2d");t instanceof ImageData?s.putImageData(t,0,0):s.drawImage(t,0,0,t.width,t.height),n=fi}return n.toDataURL(e)}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){let e=is("canvas");e.width=t.width,e.height=t.height;let n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);let s=n.getImageData(0,0,t.width,t.height),r=s.data;for(let a=0;a<r.length;a++)r[a]=bn(r[a]/255)*255;return n.putImageData(s,0,0),e}else if(t.data){let e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(bn(e[n]/255)*255):e[n]=bn(e[n]);return{data:e,width:t.width,height:t.height}}else return wt("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}},Fh=0,Ii=class{constructor(t=null){this.isSource=!0,Object.defineProperty(this,"id",{value:Fh++}),this.uuid=Gi(),this.data=t,this.dataReady=!0,this.version=0}getSize(t){let e=this.data;return typeof HTMLVideoElement<"u"&&e instanceof HTMLVideoElement?t.set(e.videoWidth,e.videoHeight,0):typeof VideoFrame<"u"&&e instanceof VideoFrame?t.set(e.displayWidth,e.displayHeight,0):e!==null?t.set(e.width,e.height,e.depth||0):t.set(0,0,0),t}set needsUpdate(t){t===!0&&this.version++}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];let n={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let a=0,o=s.length;a<o;a++)s[a].isDataTexture?r.push(ka(s[a].image)):r.push(ka(s[a]))}else r=ka(s);n.url=r}return e||(t.images[this.uuid]=n),n}};function ka(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?xr.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(wt("Texture: Unable to serialize Texture."),{})}var Oh=0,Ga=new N,De=class i extends dn{constructor(t=i.DEFAULT_IMAGE,e=i.DEFAULT_MAPPING,n=hn,s=hn,r=Se,a=Wn,o=$e,c=Ne,l=i.DEFAULT_ANISOTROPY,u=Tn){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Oh++}),this.uuid=Gi(),this.name="",this.source=new Ii(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=s,this.magFilter=r,this.minFilter=a,this.anisotropy=l,this.format=o,this.internalFormat=null,this.type=c,this.offset=new Ut(0,0),this.repeat=new Ut(1,1),this.center=new Ut(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new It,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(Ga).x}get height(){return this.source.getSize(Ga).y}get depth(){return this.source.getSize(Ga).z}get image(){return this.source.data}set image(t){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.normalized=t.normalized,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.renderTarget=t.renderTarget,this.isRenderTargetTexture=t.isRenderTargetTexture,this.isArrayTexture=t.isArrayTexture,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}setValues(t){for(let e in t){let n=t[e];if(n===void 0){wt(`Texture.setValues(): parameter '${e}' has value of undefined.`);continue}let s=this[e];if(s===void 0){wt(`Texture.setValues(): property '${e}' does not exist.`);continue}s&&n&&s.isVector2&&n.isVector2||s&&n&&s.isVector3&&n.isVector3||s&&n&&s.isMatrix3&&n.isMatrix3?s.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];let n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==Po)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case pr:t.x=t.x-Math.floor(t.x);break;case hn:t.x=t.x<0?0:1;break;case mr:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case pr:t.y=t.y-Math.floor(t.y);break;case hn:t.y=t.y<0?0:1;break;case mr:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}};De.DEFAULT_IMAGE=null;De.DEFAULT_MAPPING=Po;De.DEFAULT_ANISOTROPY=1;var se=class i{static{i.prototype.isVector4=!0}constructor(t=0,e=0,n=0,s=1){this.x=t,this.y=e,this.z=n,this.w=s}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,s){return this.x=t,this.y=e,this.z=n,this.w=s,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("THREE.Vector4: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){let e=this.x,n=this.y,s=this.z,r=this.w,a=t.elements;return this.x=a[0]*e+a[4]*n+a[8]*s+a[12]*r,this.y=a[1]*e+a[5]*n+a[9]*s+a[13]*r,this.z=a[2]*e+a[6]*n+a[10]*s+a[14]*r,this.w=a[3]*e+a[7]*n+a[11]*s+a[15]*r,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);let e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,s,r,c=t.elements,l=c[0],u=c[4],d=c[8],h=c[1],p=c[5],g=c[9],y=c[2],m=c[6],f=c[10];if(Math.abs(u-h)<.01&&Math.abs(d-y)<.01&&Math.abs(g-m)<.01){if(Math.abs(u+h)<.1&&Math.abs(d+y)<.1&&Math.abs(g+m)<.1&&Math.abs(l+p+f-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;let A=(l+1)/2,M=(p+1)/2,T=(f+1)/2,b=(u+h)/4,C=(d+y)/4,_=(g+m)/4;return A>M&&A>T?A<.01?(n=0,s=.707106781,r=.707106781):(n=Math.sqrt(A),s=b/n,r=C/n):M>T?M<.01?(n=.707106781,s=0,r=.707106781):(s=Math.sqrt(M),n=b/s,r=_/s):T<.01?(n=.707106781,s=.707106781,r=0):(r=Math.sqrt(T),n=C/r,s=_/r),this.set(n,s,r,e),this}let w=Math.sqrt((m-g)*(m-g)+(d-y)*(d-y)+(h-u)*(h-u));return Math.abs(w)<.001&&(w=1),this.x=(m-g)/w,this.y=(d-y)/w,this.z=(h-u)/w,this.w=Math.acos((l+p+f-1)/2),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this.w=e[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=Gt(this.x,t.x,e.x),this.y=Gt(this.y,t.y,e.y),this.z=Gt(this.z,t.z,e.z),this.w=Gt(this.w,t.w,e.w),this}clampScalar(t,e){return this.x=Gt(this.x,t,e),this.y=Gt(this.y,t,e),this.z=Gt(this.z,t,e),this.w=Gt(this.w,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Gt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},_r=class extends dn{constructor(t=1,e=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Se,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=t,this.height=e,this.depth=n.depth,this.scissor=new se(0,0,t,e),this.scissorTest=!1,this.viewport=new se(0,0,t,e),this.textures=[];let s={width:t,height:e,depth:n.depth},r=new De(s),a=n.count;for(let o=0;o<a;o++)this.textures[o]=r.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(t={}){let e={minFilter:Se,generateMipmaps:!1,flipY:!1,internalFormat:null};t.mapping!==void 0&&(e.mapping=t.mapping),t.wrapS!==void 0&&(e.wrapS=t.wrapS),t.wrapT!==void 0&&(e.wrapT=t.wrapT),t.wrapR!==void 0&&(e.wrapR=t.wrapR),t.magFilter!==void 0&&(e.magFilter=t.magFilter),t.minFilter!==void 0&&(e.minFilter=t.minFilter),t.format!==void 0&&(e.format=t.format),t.type!==void 0&&(e.type=t.type),t.anisotropy!==void 0&&(e.anisotropy=t.anisotropy),t.colorSpace!==void 0&&(e.colorSpace=t.colorSpace),t.flipY!==void 0&&(e.flipY=t.flipY),t.generateMipmaps!==void 0&&(e.generateMipmaps=t.generateMipmaps),t.internalFormat!==void 0&&(e.internalFormat=t.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(e)}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}set depthTexture(t){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),t!==null&&(t.renderTarget=this),this._depthTexture=t}get depthTexture(){return this._depthTexture}setSize(t,e,n=1){if(this.width!==t||this.height!==e||this.depth!==n){this.width=t,this.height=e,this.depth=n;for(let s=0,r=this.textures.length;s<r;s++)this.textures[s].image.width=t,this.textures[s].image.height=e,this.textures[s].image.depth=n,this.textures[s].isData3DTexture!==!0&&(this.textures[s].isArrayTexture=this.textures[s].image.depth>1);this.dispose()}this.viewport.set(0,0,t,e),this.scissor.set(0,0,t,e)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let e=0,n=t.textures.length;e<n;e++){this.textures[e]=t.textures[e].clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;let s=Object.assign({},t.textures[e].image);this.textures[e].source=new Ii(s)}return this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,t.depthTexture!==null&&(this.depthTexture=t.depthTexture.clone()),this.samples=t.samples,this.multiview=t.multiview,this.useArrayDepthTexture=t.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}},Ve=class extends _r{constructor(t=1,e=1,n={}){super(t,e,n),this.isWebGLRenderTarget=!0}},ss=class extends De{constructor(t=null,e=1,n=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=Me,this.minFilter=Me,this.wrapR=hn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}};var vr=class extends De{constructor(t=null,e=1,n=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=Me,this.minFilter=Me,this.wrapR=hn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var ie=class i{static{i.prototype.isMatrix4=!0}constructor(t,e,n,s,r,a,o,c,l,u,d,h,p,g,y,m){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,a,o,c,l,u,d,h,p,g,y,m)}set(t,e,n,s,r,a,o,c,l,u,d,h,p,g,y,m){let f=this.elements;return f[0]=t,f[4]=e,f[8]=n,f[12]=s,f[1]=r,f[5]=a,f[9]=o,f[13]=c,f[2]=l,f[6]=u,f[10]=d,f[14]=h,f[3]=p,f[7]=g,f[11]=y,f[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new i().fromArray(this.elements)}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){let e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){let e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return this.determinantAffine()===0?(t.set(1,0,0),e.set(0,1,0),n.set(0,0,1),this):(t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){if(t.determinantAffine()===0)return this.identity();let e=this.elements,n=t.elements,s=1/pi.setFromMatrixColumn(t,0).length(),r=1/pi.setFromMatrixColumn(t,1).length(),a=1/pi.setFromMatrixColumn(t,2).length();return e[0]=n[0]*s,e[1]=n[1]*s,e[2]=n[2]*s,e[3]=0,e[4]=n[4]*r,e[5]=n[5]*r,e[6]=n[6]*r,e[7]=0,e[8]=n[8]*a,e[9]=n[9]*a,e[10]=n[10]*a,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){let e=this.elements,n=t.x,s=t.y,r=t.z,a=Math.cos(n),o=Math.sin(n),c=Math.cos(s),l=Math.sin(s),u=Math.cos(r),d=Math.sin(r);if(t.order==="XYZ"){let h=a*u,p=a*d,g=o*u,y=o*d;e[0]=c*u,e[4]=-c*d,e[8]=l,e[1]=p+g*l,e[5]=h-y*l,e[9]=-o*c,e[2]=y-h*l,e[6]=g+p*l,e[10]=a*c}else if(t.order==="YXZ"){let h=c*u,p=c*d,g=l*u,y=l*d;e[0]=h+y*o,e[4]=g*o-p,e[8]=a*l,e[1]=a*d,e[5]=a*u,e[9]=-o,e[2]=p*o-g,e[6]=y+h*o,e[10]=a*c}else if(t.order==="ZXY"){let h=c*u,p=c*d,g=l*u,y=l*d;e[0]=h-y*o,e[4]=-a*d,e[8]=g+p*o,e[1]=p+g*o,e[5]=a*u,e[9]=y-h*o,e[2]=-a*l,e[6]=o,e[10]=a*c}else if(t.order==="ZYX"){let h=a*u,p=a*d,g=o*u,y=o*d;e[0]=c*u,e[4]=g*l-p,e[8]=h*l+y,e[1]=c*d,e[5]=y*l+h,e[9]=p*l-g,e[2]=-l,e[6]=o*c,e[10]=a*c}else if(t.order==="YZX"){let h=a*c,p=a*l,g=o*c,y=o*l;e[0]=c*u,e[4]=y-h*d,e[8]=g*d+p,e[1]=d,e[5]=a*u,e[9]=-o*u,e[2]=-l*u,e[6]=p*d+g,e[10]=h-y*d}else if(t.order==="XZY"){let h=a*c,p=a*l,g=o*c,y=o*l;e[0]=c*u,e[4]=-d,e[8]=l*u,e[1]=h*d+y,e[5]=a*u,e[9]=p*d-g,e[2]=g*d-p,e[6]=o*u,e[10]=y*d+h}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(Bh,t,zh)}lookAt(t,e,n){let s=this.elements;return Fe.subVectors(t,e),Fe.lengthSq()===0&&(Fe.z=1),Fe.normalize(),In.crossVectors(n,Fe),In.lengthSq()===0&&(Math.abs(n.z)===1?Fe.x+=1e-4:Fe.z+=1e-4,Fe.normalize(),In.crossVectors(n,Fe)),In.normalize(),Bs.crossVectors(Fe,In),s[0]=In.x,s[4]=Bs.x,s[8]=Fe.x,s[1]=In.y,s[5]=Bs.y,s[9]=Fe.y,s[2]=In.z,s[6]=Bs.z,s[10]=Fe.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,s=e.elements,r=this.elements,a=n[0],o=n[4],c=n[8],l=n[12],u=n[1],d=n[5],h=n[9],p=n[13],g=n[2],y=n[6],m=n[10],f=n[14],w=n[3],A=n[7],M=n[11],T=n[15],b=s[0],C=s[4],_=s[8],E=s[12],P=s[1],I=s[5],D=s[9],W=s[13],X=s[2],R=s[6],B=s[10],H=s[14],$=s[3],j=s[7],nt=s[11],ct=s[15];return r[0]=a*b+o*P+c*X+l*$,r[4]=a*C+o*I+c*R+l*j,r[8]=a*_+o*D+c*B+l*nt,r[12]=a*E+o*W+c*H+l*ct,r[1]=u*b+d*P+h*X+p*$,r[5]=u*C+d*I+h*R+p*j,r[9]=u*_+d*D+h*B+p*nt,r[13]=u*E+d*W+h*H+p*ct,r[2]=g*b+y*P+m*X+f*$,r[6]=g*C+y*I+m*R+f*j,r[10]=g*_+y*D+m*B+f*nt,r[14]=g*E+y*W+m*H+f*ct,r[3]=w*b+A*P+M*X+T*$,r[7]=w*C+A*I+M*R+T*j,r[11]=w*_+A*D+M*B+T*nt,r[15]=w*E+A*W+M*H+T*ct,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[4],s=t[8],r=t[12],a=t[1],o=t[5],c=t[9],l=t[13],u=t[2],d=t[6],h=t[10],p=t[14],g=t[3],y=t[7],m=t[11],f=t[15],w=c*p-l*h,A=o*p-l*d,M=o*h-c*d,T=a*p-l*u,b=a*h-c*u,C=a*d-o*u;return e*(y*w-m*A+f*M)-n*(g*w-m*T+f*b)+s*(g*A-y*T+f*C)-r*(g*M-y*b+m*C)}determinantAffine(){let t=this.elements,e=t[0],n=t[4],s=t[8],r=t[1],a=t[5],o=t[9],c=t[2],l=t[6],u=t[10];return e*(a*u-o*l)-n*(r*u-o*c)+s*(r*l-a*c)}transpose(){let t=this.elements,e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){let s=this.elements;return t.isVector3?(s[12]=t.x,s[13]=t.y,s[14]=t.z):(s[12]=t,s[13]=e,s[14]=n),this}invert(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],a=t[4],o=t[5],c=t[6],l=t[7],u=t[8],d=t[9],h=t[10],p=t[11],g=t[12],y=t[13],m=t[14],f=t[15],w=e*o-n*a,A=e*c-s*a,M=e*l-r*a,T=n*c-s*o,b=n*l-r*o,C=s*l-r*c,_=u*y-d*g,E=u*m-h*g,P=u*f-p*g,I=d*m-h*y,D=d*f-p*y,W=h*f-p*m,X=w*W-A*D+M*I+T*P-b*E+C*_;if(X===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let R=1/X;return t[0]=(o*W-c*D+l*I)*R,t[1]=(s*D-n*W-r*I)*R,t[2]=(y*C-m*b+f*T)*R,t[3]=(h*b-d*C-p*T)*R,t[4]=(c*P-a*W-l*E)*R,t[5]=(e*W-s*P+r*E)*R,t[6]=(m*M-g*C-f*A)*R,t[7]=(u*C-h*M+p*A)*R,t[8]=(a*D-o*P+l*_)*R,t[9]=(n*P-e*D-r*_)*R,t[10]=(g*b-y*M+f*w)*R,t[11]=(d*M-u*b-p*w)*R,t[12]=(o*E-a*I-c*_)*R,t[13]=(e*I-n*E+s*_)*R,t[14]=(y*A-g*T-m*w)*R,t[15]=(u*T-d*A+h*w)*R,this}scale(t){let e=this.elements,n=t.x,s=t.y,r=t.z;return e[0]*=n,e[4]*=s,e[8]*=r,e[1]*=n,e[5]*=s,e[9]*=r,e[2]*=n,e[6]*=s,e[10]*=r,e[3]*=n,e[7]*=s,e[11]*=r,this}getMaxScaleOnAxis(){let t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],s=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,s))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){let e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){let n=Math.cos(e),s=Math.sin(e),r=1-n,a=t.x,o=t.y,c=t.z,l=r*a,u=r*o;return this.set(l*a+n,l*o-s*c,l*c+s*o,0,l*o+s*c,u*o+n,u*c-s*a,0,l*c-s*o,u*c+s*a,r*c*c+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,s,r,a){return this.set(1,n,r,0,t,1,a,0,e,s,1,0,0,0,0,1),this}compose(t,e,n){let s=this.elements,r=e._x,a=e._y,o=e._z,c=e._w,l=r+r,u=a+a,d=o+o,h=r*l,p=r*u,g=r*d,y=a*u,m=a*d,f=o*d,w=c*l,A=c*u,M=c*d,T=n.x,b=n.y,C=n.z;return s[0]=(1-(y+f))*T,s[1]=(p+M)*T,s[2]=(g-A)*T,s[3]=0,s[4]=(p-M)*b,s[5]=(1-(h+f))*b,s[6]=(m+w)*b,s[7]=0,s[8]=(g+A)*C,s[9]=(m-w)*C,s[10]=(1-(h+y))*C,s[11]=0,s[12]=t.x,s[13]=t.y,s[14]=t.z,s[15]=1,this}decompose(t,e,n){let s=this.elements;t.x=s[12],t.y=s[13],t.z=s[14];let r=this.determinantAffine();if(r===0)return n.set(1,1,1),e.identity(),this;let a=pi.set(s[0],s[1],s[2]).length(),o=pi.set(s[4],s[5],s[6]).length(),c=pi.set(s[8],s[9],s[10]).length();r<0&&(a=-a),Je.copy(this);let l=1/a,u=1/o,d=1/c;return Je.elements[0]*=l,Je.elements[1]*=l,Je.elements[2]*=l,Je.elements[4]*=u,Je.elements[5]*=u,Je.elements[6]*=u,Je.elements[8]*=d,Je.elements[9]*=d,Je.elements[10]*=d,e.setFromRotationMatrix(Je),n.x=a,n.y=o,n.z=c,this}makePerspective(t,e,n,s,r,a,o=je,c=!1){let l=this.elements,u=2*r/(e-t),d=2*r/(n-s),h=(e+t)/(e-t),p=(n+s)/(n-s),g,y;if(c)g=r/(a-r),y=a*r/(a-r);else if(o===je)g=-(a+r)/(a-r),y=-2*a*r/(a-r);else if(o===Ai)g=-a/(a-r),y=-a*r/(a-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return l[0]=u,l[4]=0,l[8]=h,l[12]=0,l[1]=0,l[5]=d,l[9]=p,l[13]=0,l[2]=0,l[6]=0,l[10]=g,l[14]=y,l[3]=0,l[7]=0,l[11]=-1,l[15]=0,this}makeOrthographic(t,e,n,s,r,a,o=je,c=!1){let l=this.elements,u=2/(e-t),d=2/(n-s),h=-(e+t)/(e-t),p=-(n+s)/(n-s),g,y;if(c)g=1/(a-r),y=a/(a-r);else if(o===je)g=-2/(a-r),y=-(a+r)/(a-r);else if(o===Ai)g=-1/(a-r),y=-r/(a-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return l[0]=u,l[4]=0,l[8]=0,l[12]=h,l[1]=0,l[5]=d,l[9]=0,l[13]=p,l[2]=0,l[6]=0,l[10]=g,l[14]=y,l[3]=0,l[7]=0,l[11]=0,l[15]=1,this}equals(t){let e=this.elements,n=t.elements;for(let s=0;s<16;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}},pi=new N,Je=new ie,Bh=new N(0,0,0),zh=new N(1,1,1),In=new N,Bs=new N,Fe=new N,wl=new ie,Tl=new Ye,En=class i{constructor(t=0,e=0,n=0,s=i.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=s}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,s=this._order){return this._x=t,this._y=e,this._z=n,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){let s=t.elements,r=s[0],a=s[4],o=s[8],c=s[1],l=s[5],u=s[9],d=s[2],h=s[6],p=s[10];switch(e){case"XYZ":this._y=Math.asin(Gt(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-u,p),this._z=Math.atan2(-a,r)):(this._x=Math.atan2(h,l),this._z=0);break;case"YXZ":this._x=Math.asin(-Gt(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(o,p),this._z=Math.atan2(c,l)):(this._y=Math.atan2(-d,r),this._z=0);break;case"ZXY":this._x=Math.asin(Gt(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(-d,p),this._z=Math.atan2(-a,l)):(this._y=0,this._z=Math.atan2(c,r));break;case"ZYX":this._y=Math.asin(-Gt(d,-1,1)),Math.abs(d)<.9999999?(this._x=Math.atan2(h,p),this._z=Math.atan2(c,r)):(this._x=0,this._z=Math.atan2(-a,l));break;case"YZX":this._z=Math.asin(Gt(c,-1,1)),Math.abs(c)<.9999999?(this._x=Math.atan2(-u,l),this._y=Math.atan2(-d,r)):(this._x=0,this._y=Math.atan2(o,p));break;case"XZY":this._z=Math.asin(-Gt(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(h,l),this._y=Math.atan2(o,r)):(this._x=Math.atan2(-u,p),this._y=0);break;default:wt("Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return wl.makeRotationFromQuaternion(t),this.setFromRotationMatrix(wl,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return Tl.setFromEuler(this),this.setFromQuaternion(Tl,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};En.DEFAULT_ORDER="XYZ";var Pi=class{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}},Vh=0,Al=new N,mi=new Ye,xn=new ie,zs=new N,Zi=new N,kh=new N,Gh=new Ye,Cl=new N(1,0,0),Rl=new N(0,1,0),Il=new N(0,0,1),Pl={type:"added"},Hh={type:"removed"},gi={type:"childadded",child:null},Ha={type:"childremoved",child:null},Re=class i extends dn{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Vh++}),this.uuid=Gi(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=i.DEFAULT_UP.clone();let t=new N,e=new En,n=new Ye,s=new N(1,1,1);function r(){n.setFromEuler(e,!1)}function a(){e.setFromQuaternion(n,void 0,!1)}e._onChange(r),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new ie},normalMatrix:{value:new It}}),this.matrix=new ie,this.matrixWorld=new ie,this.matrixAutoUpdate=i.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=i.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Pi,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return mi.setFromAxisAngle(t,e),this.quaternion.multiply(mi),this}rotateOnWorldAxis(t,e){return mi.setFromAxisAngle(t,e),this.quaternion.premultiply(mi),this}rotateX(t){return this.rotateOnAxis(Cl,t)}rotateY(t){return this.rotateOnAxis(Rl,t)}rotateZ(t){return this.rotateOnAxis(Il,t)}translateOnAxis(t,e){return Al.copy(t).applyQuaternion(this.quaternion),this.position.add(Al.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(Cl,t)}translateY(t){return this.translateOnAxis(Rl,t)}translateZ(t){return this.translateOnAxis(Il,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(xn.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?zs.copy(t):zs.set(t,e,n);let s=this.parent;this.updateWorldMatrix(!0,!1),Zi.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?xn.lookAt(Zi,zs,this.up):xn.lookAt(zs,Zi,this.up),this.quaternion.setFromRotationMatrix(xn),s&&(xn.extractRotation(s.matrixWorld),mi.setFromRotationMatrix(xn),this.quaternion.premultiply(mi.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(Ct("Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(Pl),gi.child=t,this.dispatchEvent(gi),gi.child=null):Ct("Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(Hh),Ha.child=t,this.dispatchEvent(Ha),Ha.child=null),this}removeFromParent(){let t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),xn.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),xn.multiply(t.parent.matrixWorld)),t.applyMatrix4(xn),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(Pl),gi.child=t,this.dispatchEvent(gi),gi.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,s=this.children.length;n<s;n++){let a=this.children[n].getObjectByProperty(t,e);if(a!==void 0)return a}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);let s=this.children;for(let r=0,a=s.length;r<a;r++)s[r].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Zi,t,kh),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Zi,Gh,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);let e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}traverse(t){t(this);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverseVisible(t)}traverseAncestors(t){let e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let t=this.pivot;if(t!==null){let e=t.x,n=t.y,s=t.z,r=this.matrix.elements;r[12]+=e-r[0]*e-r[4]*n-r[8]*s,r[13]+=n-r[1]*e-r[5]*n-r[9]*s,r[14]+=s-r[2]*e-r[6]*n-r[10]*s}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].updateMatrixWorld(t)}updateWorldMatrix(t,e,n=!1){let s=this.parent;if(t===!0&&s!==null&&s.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),e===!0){let r=this.children;for(let a=0,o=r.length;a<o;a++)r[a].updateWorldMatrix(!1,!0,n)}}toJSON(t){let e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let s={};s.uuid=this.uuid,s.type=this.type,this.name!==""&&(s.name=this.name),this.castShadow===!0&&(s.castShadow=!0),this.receiveShadow===!0&&(s.receiveShadow=!0),this.visible===!1&&(s.visible=!1),this.frustumCulled===!1&&(s.frustumCulled=!1),this.renderOrder!==0&&(s.renderOrder=this.renderOrder),this.static!==!1&&(s.static=this.static),Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.pivot!==null&&(s.pivot=this.pivot.toArray()),this.matrixAutoUpdate===!1&&(s.matrixAutoUpdate=!1),this.morphTargetDictionary!==void 0&&(s.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(s.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),s.instanceInfo=this._instanceInfo.map(o=>({...o})),s.availableInstanceIds=this._availableInstanceIds.slice(),s.availableGeometryIds=this._availableGeometryIds.slice(),s.nextIndexStart=this._nextIndexStart,s.nextVertexStart=this._nextVertexStart,s.geometryCount=this._geometryCount,s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.matricesTexture=this._matricesTexture.toJSON(t),s.indirectTexture=this._indirectTexture.toJSON(t),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(s.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(s.boundingBox=this.boundingBox.toJSON()));function r(o,c){return o[c.uuid]===void 0&&(o[c.uuid]=c.toJSON(t)),c.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(t.geometries,this.geometry);let o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){let c=o.shapes;if(Array.isArray(c))for(let l=0,u=c.length;l<u;l++){let d=c[l];r(t.shapes,d)}else r(t.shapes,c)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(t.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let o=[];for(let c=0,l=this.material.length;c<l;c++)o.push(r(t.materials,this.material[c]));s.material=o}else s.material=r(t.materials,this.material);if(this.children.length>0){s.children=[];for(let o=0;o<this.children.length;o++)s.children.push(this.children[o].toJSON(t).object)}if(this.animations.length>0){s.animations=[];for(let o=0;o<this.animations.length;o++){let c=this.animations[o];s.animations.push(r(t.animations,c))}}if(e){let o=a(t.geometries),c=a(t.materials),l=a(t.textures),u=a(t.images),d=a(t.shapes),h=a(t.skeletons),p=a(t.animations),g=a(t.nodes);o.length>0&&(n.geometries=o),c.length>0&&(n.materials=c),l.length>0&&(n.textures=l),u.length>0&&(n.images=u),d.length>0&&(n.shapes=d),h.length>0&&(n.skeletons=h),p.length>0&&(n.animations=p),g.length>0&&(n.nodes=g)}return n.object=s,n;function a(o){let c=[];for(let l in o){let u=o[l];delete u.metadata,c.push(u)}return c}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.pivot=t.pivot!==null?t.pivot.clone():null,this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.static=t.static,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){let s=t.children[n];this.add(s.clone())}return this}};Re.DEFAULT_UP=new N(0,1,0);Re.DEFAULT_MATRIX_AUTO_UPDATE=!0;Re.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var tn=class extends Re{constructor(){super(),this.isGroup=!0,this.type="Group"}},Wh={type:"move"},Li=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new tn,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new tn,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new N,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new N),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new tn,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new N,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new N,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){let e=this._hand;if(e)for(let n of t.hand.values())this._getHandJoint(e,n)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,e,n){let s=null,r=null,a=null,o=this._targetRay,c=this._grip,l=this._hand;if(t&&e.session.visibilityState!=="visible-blurred"){if(l&&t.hand){a=!0;for(let y of t.hand.values()){let m=e.getJointPose(y,n),f=this._getHandJoint(l,y);m!==null&&(f.matrix.fromArray(m.transform.matrix),f.matrix.decompose(f.position,f.rotation,f.scale),f.matrixWorldNeedsUpdate=!0,f.jointRadius=m.radius),f.visible=m!==null}let u=l.joints["index-finger-tip"],d=l.joints["thumb-tip"],h=u.position.distanceTo(d.position),p=.02,g=.005;l.inputState.pinching&&h>p+g?(l.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!l.inputState.pinching&&h<=p-g&&(l.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else c!==null&&t.gripSpace&&(r=e.getPose(t.gripSpace,n),r!==null&&(c.matrix.fromArray(r.transform.matrix),c.matrix.decompose(c.position,c.rotation,c.scale),c.matrixWorldNeedsUpdate=!0,r.linearVelocity?(c.hasLinearVelocity=!0,c.linearVelocity.copy(r.linearVelocity)):c.hasLinearVelocity=!1,r.angularVelocity?(c.hasAngularVelocity=!0,c.angularVelocity.copy(r.angularVelocity)):c.hasAngularVelocity=!1,c.eventsEnabled&&c.dispatchEvent({type:"gripUpdated",data:t,target:this})));o!==null&&(s=e.getPose(t.targetRaySpace,n),s===null&&r!==null&&(s=r),s!==null&&(o.matrix.fromArray(s.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,s.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(s.linearVelocity)):o.hasLinearVelocity=!1,s.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(s.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(Wh)))}return o!==null&&(o.visible=s!==null),c!==null&&(c.visible=r!==null),l!==null&&(l.visible=a!==null),this}_getHandJoint(t,e){if(t.joints[e.jointName]===void 0){let n=new tn;n.matrixAutoUpdate=!1,n.visible=!1,t.joints[e.jointName]=n,t.add(n)}return t.joints[e.jointName]}},wc={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Pn={h:0,s:0,l:0},Vs={h:0,s:0,l:0};function Wa(i,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?i+(t-i)*6*e:e<1/2?t:e<2/3?i+(t-i)*6*(2/3-e):i}var Pt=class{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){let s=t;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=Be){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,kt.colorSpaceToWorking(this,e),this}setRGB(t,e,n,s=kt.workingColorSpace){return this.r=t,this.g=e,this.b=n,kt.colorSpaceToWorking(this,s),this}setHSL(t,e,n,s=kt.workingColorSpace){if(t=ko(t,1),e=Gt(e,0,1),n=Gt(n,0,1),e===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+e):n+e-n*e,a=2*n-r;this.r=Wa(a,r,t+1/3),this.g=Wa(a,r,t),this.b=Wa(a,r,t-1/3)}return kt.colorSpaceToWorking(this,s),this}setStyle(t,e=Be){function n(r){r!==void 0&&parseFloat(r)<1&&wt("Color: Alpha component of "+t+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(t)){let r,a=s[1],o=s[2];switch(a){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,e);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,e);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,e);break;default:wt("Color: Unknown color model "+t)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(t)){let r=s[1],a=r.length;if(a===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,e);if(a===6)return this.setHex(parseInt(r,16),e);wt("Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=Be){let n=wc[t.toLowerCase()];return n!==void 0?this.setHex(n,e):wt("Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=bn(t.r),this.g=bn(t.g),this.b=bn(t.b),this}copyLinearToSRGB(t){return this.r=Ti(t.r),this.g=Ti(t.g),this.b=Ti(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=Be){return kt.workingToColorSpace(Ae.copy(this),t),Math.round(Gt(Ae.r*255,0,255))*65536+Math.round(Gt(Ae.g*255,0,255))*256+Math.round(Gt(Ae.b*255,0,255))}getHexString(t=Be){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=kt.workingColorSpace){kt.workingToColorSpace(Ae.copy(this),e);let n=Ae.r,s=Ae.g,r=Ae.b,a=Math.max(n,s,r),o=Math.min(n,s,r),c,l,u=(o+a)/2;if(o===a)c=0,l=0;else{let d=a-o;switch(l=u<=.5?d/(a+o):d/(2-a-o),a){case n:c=(s-r)/d+(s<r?6:0);break;case s:c=(r-n)/d+2;break;case r:c=(n-s)/d+4;break}c/=6}return t.h=c,t.s=l,t.l=u,t}getRGB(t,e=kt.workingColorSpace){return kt.workingToColorSpace(Ae.copy(this),e),t.r=Ae.r,t.g=Ae.g,t.b=Ae.b,t}getStyle(t=Be){kt.workingToColorSpace(Ae.copy(this),t);let e=Ae.r,n=Ae.g,s=Ae.b;return t!==Be?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(s*255)})`}offsetHSL(t,e,n){return this.getHSL(Pn),this.setHSL(Pn.h+t,Pn.s+e,Pn.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(Pn),t.getHSL(Vs);let n=ji(Pn.h,Vs.h,e),s=ji(Pn.s,Vs.s,e),r=ji(Pn.l,Vs.l,e);return this.setHSL(n,s,r),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){let e=this.r,n=this.g,s=this.b,r=t.elements;return this.r=r[0]*e+r[3]*n+r[6]*s,this.g=r[1]*e+r[4]*n+r[7]*s,this.b=r[2]*e+r[5]*n+r[8]*s,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Ae=new Pt;Pt.NAMES=wc;var rs=class i{constructor(t,e=1,n=1e3){this.isFog=!0,this.name="",this.color=new Pt(t),this.near=e,this.far=n}clone(){return new i(this.color,this.near,this.far)}toJSON(){return{type:"Fog",name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}},as=class extends Re{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new En,this.environmentIntensity=1,this.environmentRotation=new En,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,e){return super.copy(t,e),t.background!==null&&(this.background=t.background.clone()),t.environment!==null&&(this.environment=t.environment.clone()),t.fog!==null&&(this.fog=t.fog.clone()),this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),t.overrideMaterial!==null&&(this.overrideMaterial=t.overrideMaterial.clone()),this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){let e=super.toJSON(t);return this.fog!==null&&(e.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(e.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(e.object.backgroundIntensity=this.backgroundIntensity),e.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(e.object.environmentIntensity=this.environmentIntensity),e.object.environmentRotation=this.environmentRotation.toArray(),e}},Ke=new N,_n=new N,Xa=new N,vn=new N,xi=new N,_i=new N,Ll=new N,qa=new N,Ya=new N,Za=new N,$a=new se,Ja=new se,Ka=new se,Fn=class i{constructor(t=new N,e=new N,n=new N){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,s){s.subVectors(n,e),Ke.subVectors(t,e),s.cross(Ke);let r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(t,e,n,s,r){Ke.subVectors(s,e),_n.subVectors(n,e),Xa.subVectors(t,e);let a=Ke.dot(Ke),o=Ke.dot(_n),c=Ke.dot(Xa),l=_n.dot(_n),u=_n.dot(Xa),d=a*l-o*o;if(d===0)return r.set(0,0,0),null;let h=1/d,p=(l*c-o*u)*h,g=(a*u-o*c)*h;return r.set(1-p-g,g,p)}static containsPoint(t,e,n,s){return this.getBarycoord(t,e,n,s,vn)===null?!1:vn.x>=0&&vn.y>=0&&vn.x+vn.y<=1}static getInterpolation(t,e,n,s,r,a,o,c){return this.getBarycoord(t,e,n,s,vn)===null?(c.x=0,c.y=0,"z"in c&&(c.z=0),"w"in c&&(c.w=0),null):(c.setScalar(0),c.addScaledVector(r,vn.x),c.addScaledVector(a,vn.y),c.addScaledVector(o,vn.z),c)}static getInterpolatedAttribute(t,e,n,s,r,a){return $a.setScalar(0),Ja.setScalar(0),Ka.setScalar(0),$a.fromBufferAttribute(t,e),Ja.fromBufferAttribute(t,n),Ka.fromBufferAttribute(t,s),a.setScalar(0),a.addScaledVector($a,r.x),a.addScaledVector(Ja,r.y),a.addScaledVector(Ka,r.z),a}static isFrontFacing(t,e,n,s){return Ke.subVectors(n,e),_n.subVectors(t,e),Ke.cross(_n).dot(s)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,s){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[s]),this}setFromAttributeAndIndices(t,e,n,s){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,s),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return Ke.subVectors(this.c,this.b),_n.subVectors(this.a,this.b),Ke.cross(_n).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return i.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return i.getBarycoord(t,this.a,this.b,this.c,e)}getInterpolation(t,e,n,s,r){return i.getInterpolation(t,this.a,this.b,this.c,e,n,s,r)}containsPoint(t){return i.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return i.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){let n=this.a,s=this.b,r=this.c,a,o;xi.subVectors(s,n),_i.subVectors(r,n),qa.subVectors(t,n);let c=xi.dot(qa),l=_i.dot(qa);if(c<=0&&l<=0)return e.copy(n);Ya.subVectors(t,s);let u=xi.dot(Ya),d=_i.dot(Ya);if(u>=0&&d<=u)return e.copy(s);let h=c*d-u*l;if(h<=0&&c>=0&&u<=0)return a=c/(c-u),e.copy(n).addScaledVector(xi,a);Za.subVectors(t,r);let p=xi.dot(Za),g=_i.dot(Za);if(g>=0&&p<=g)return e.copy(r);let y=p*l-c*g;if(y<=0&&l>=0&&g<=0)return o=l/(l-g),e.copy(n).addScaledVector(_i,o);let m=u*g-p*d;if(m<=0&&d-u>=0&&p-g>=0)return Ll.subVectors(r,s),o=(d-u)/(d-u+(p-g)),e.copy(s).addScaledVector(Ll,o);let f=1/(m+y+h);return a=y*f,o=h*f,e.copy(n).addScaledVector(xi,a).addScaledVector(_i,o)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}},Bn=class{constructor(t=new N(1/0,1/0,1/0),e=new N(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(Qe.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(Qe.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){let n=Qe.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);let n=t.geometry;if(n!==void 0){let r=n.getAttribute("position");if(e===!0&&r!==void 0&&t.isInstancedMesh!==!0)for(let a=0,o=r.count;a<o;a++)t.isMesh===!0?t.getVertexPosition(a,Qe):Qe.fromBufferAttribute(r,a),Qe.applyMatrix4(t.matrixWorld),this.expandByPoint(Qe);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),ks.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),ks.copy(n.boundingBox)),ks.applyMatrix4(t.matrixWorld),this.union(ks)}let s=t.children;for(let r=0,a=s.length;r<a;r++)this.expandByObject(s[r],e);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,Qe),Qe.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter($i),Gs.subVectors(this.max,$i),vi.subVectors(t.a,$i),yi.subVectors(t.b,$i),Mi.subVectors(t.c,$i),Ln.subVectors(yi,vi),Dn.subVectors(Mi,yi),Jn.subVectors(vi,Mi);let e=[0,-Ln.z,Ln.y,0,-Dn.z,Dn.y,0,-Jn.z,Jn.y,Ln.z,0,-Ln.x,Dn.z,0,-Dn.x,Jn.z,0,-Jn.x,-Ln.y,Ln.x,0,-Dn.y,Dn.x,0,-Jn.y,Jn.x,0];return!Qa(e,vi,yi,Mi,Gs)||(e=[1,0,0,0,1,0,0,0,1],!Qa(e,vi,yi,Mi,Gs))?!1:(Hs.crossVectors(Ln,Dn),e=[Hs.x,Hs.y,Hs.z],Qa(e,vi,yi,Mi,Gs))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,Qe).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(Qe).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(yn[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),yn[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),yn[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),yn[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),yn[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),yn[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),yn[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),yn[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(yn),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(t){return this.min.fromArray(t.min),this.max.fromArray(t.max),this}},yn=[new N,new N,new N,new N,new N,new N,new N,new N],Qe=new N,ks=new Bn,vi=new N,yi=new N,Mi=new N,Ln=new N,Dn=new N,Jn=new N,$i=new N,Gs=new N,Hs=new N,Kn=new N;function Qa(i,t,e,n,s){for(let r=0,a=i.length-3;r<=a;r+=3){Kn.fromArray(i,r);let o=s.x*Math.abs(Kn.x)+s.y*Math.abs(Kn.y)+s.z*Math.abs(Kn.z),c=t.dot(Kn),l=e.dot(Kn),u=n.dot(Kn);if(Math.max(-Math.max(c,l,u),Math.min(c,l,u))>o)return!1}return!0}var pe=new N,Ws=new Ut,Xh=0,ze=class extends dn{constructor(t,e,n=!1){if(super(),Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Xh++}),this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=fo,this.updateRanges=[],this.gpuType=rn,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[t+s]=e.array[n+s];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)Ws.fromBufferAttribute(this,e),Ws.applyMatrix3(t),this.setXY(e,Ws.x,Ws.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)pe.fromBufferAttribute(this,e),pe.applyMatrix3(t),this.setXYZ(e,pe.x,pe.y,pe.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)pe.fromBufferAttribute(this,e),pe.applyMatrix4(t),this.setXYZ(e,pe.x,pe.y,pe.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)pe.fromBufferAttribute(this,e),pe.applyNormalMatrix(t),this.setXYZ(e,pe.x,pe.y,pe.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)pe.fromBufferAttribute(this,e),pe.transformDirection(t),this.setXYZ(e,pe.x,pe.y,pe.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=wi(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=Pe(n,this.array)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=wi(e,this.array)),e}setX(t,e){return this.normalized&&(e=Pe(e,this.array)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=wi(e,this.array)),e}setY(t,e){return this.normalized&&(e=Pe(e,this.array)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=wi(e,this.array)),e}setZ(t,e){return this.normalized&&(e=Pe(e,this.array)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=wi(e,this.array)),e}setW(t,e){return this.normalized&&(e=Pe(e,this.array)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=Pe(e,this.array),n=Pe(n,this.array)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,s){return t*=this.itemSize,this.normalized&&(e=Pe(e,this.array),n=Pe(n,this.array),s=Pe(s,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this}setXYZW(t,e,n,s,r){return t*=this.itemSize,this.normalized&&(e=Pe(e,this.array),n=Pe(n,this.array),s=Pe(s,this.array),r=Pe(r,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this.array[t+3]=r,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(t.name=this.name),this.usage!==fo&&(t.usage=this.usage),t}dispose(){this.dispatchEvent({type:"dispose"})}};var os=class extends ze{constructor(t,e,n){super(new Uint16Array(t),e,n)}};var ls=class extends ze{constructor(t,e,n){super(new Uint32Array(t),e,n)}};var ue=class extends ze{constructor(t,e,n){super(new Float32Array(t),e,n)}},qh=new Bn,Ji=new N,ja=new N,Di=class{constructor(t=new N,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){let n=this.center;e!==void 0?n.copy(e):qh.setFromPoints(t).getCenter(n);let s=0;for(let r=0,a=t.length;r<a;r++)s=Math.max(s,n.distanceToSquared(t[r]));return this.radius=Math.sqrt(s),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){let e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){let n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;Ji.subVectors(t,this.center);let e=Ji.lengthSq();if(e>this.radius*this.radius){let n=Math.sqrt(e),s=(n-this.radius)*.5;this.center.addScaledVector(Ji,s/n),this.radius+=s}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(ja.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(Ji.copy(t.center).add(ja)),this.expandByPoint(Ji.copy(t.center).sub(ja))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(t){return this.radius=t.radius,this.center.fromArray(t.center),this}},Yh=0,Xe=new ie,to=new Re,bi=new N,Oe=new Bn,Ki=new Bn,ye=new N,ke=class i extends dn{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Yh++}),this.uuid=Gi(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(xh(t)?ls:os)(t,1):this.index=t,this}setIndirect(t,e=0){return this.indirect=t,this.indirectOffset=e,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){let e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new It().getNormalMatrix(t);n.applyNormalMatrix(r),n.needsUpdate=!0}let s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(t),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(t){return Xe.makeRotationFromQuaternion(t),this.applyMatrix4(Xe),this}rotateX(t){return Xe.makeRotationX(t),this.applyMatrix4(Xe),this}rotateY(t){return Xe.makeRotationY(t),this.applyMatrix4(Xe),this}rotateZ(t){return Xe.makeRotationZ(t),this.applyMatrix4(Xe),this}translate(t,e,n){return Xe.makeTranslation(t,e,n),this.applyMatrix4(Xe),this}scale(t,e,n){return Xe.makeScale(t,e,n),this.applyMatrix4(Xe),this}lookAt(t){return to.lookAt(t),to.updateMatrix(),this.applyMatrix4(to.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(bi).negate(),this.translate(bi.x,bi.y,bi.z),this}setFromPoints(t){let e=this.getAttribute("position");if(e===void 0){let n=[];for(let s=0,r=t.length;s<r;s++){let a=t[s];n.push(a.x,a.y,a.z||0)}this.setAttribute("position",new ue(n,3))}else{let n=Math.min(t.length,e.count);for(let s=0;s<n;s++){let r=t[s];e.setXYZ(s,r.x,r.y,r.z||0)}t.length>e.count&&wt("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),e.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Bn);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){Ct("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new N(-1/0,-1/0,-1/0),new N(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,s=e.length;n<s;n++){let r=e[n];Oe.setFromBufferAttribute(r),this.morphTargetsRelative?(ye.addVectors(this.boundingBox.min,Oe.min),this.boundingBox.expandByPoint(ye),ye.addVectors(this.boundingBox.max,Oe.max),this.boundingBox.expandByPoint(ye)):(this.boundingBox.expandByPoint(Oe.min),this.boundingBox.expandByPoint(Oe.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&Ct('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Di);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){Ct("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new N,1/0);return}if(t){let n=this.boundingSphere.center;if(Oe.setFromBufferAttribute(t),e)for(let r=0,a=e.length;r<a;r++){let o=e[r];Ki.setFromBufferAttribute(o),this.morphTargetsRelative?(ye.addVectors(Oe.min,Ki.min),Oe.expandByPoint(ye),ye.addVectors(Oe.max,Ki.max),Oe.expandByPoint(ye)):(Oe.expandByPoint(Ki.min),Oe.expandByPoint(Ki.max))}Oe.getCenter(n);let s=0;for(let r=0,a=t.count;r<a;r++)ye.fromBufferAttribute(t,r),s=Math.max(s,n.distanceToSquared(ye));if(e)for(let r=0,a=e.length;r<a;r++){let o=e[r],c=this.morphTargetsRelative;for(let l=0,u=o.count;l<u;l++)ye.fromBufferAttribute(o,l),c&&(bi.fromBufferAttribute(t,l),ye.add(bi)),s=Math.max(s,n.distanceToSquared(ye))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&Ct('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){Ct("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=e.position,s=e.normal,r=e.uv,a=this.getAttribute("tangent");(a===void 0||a.count!==n.count)&&(a=new ze(new Float32Array(4*n.count),4),this.setAttribute("tangent",a));let o=[],c=[];for(let _=0;_<n.count;_++)o[_]=new N,c[_]=new N;let l=new N,u=new N,d=new N,h=new Ut,p=new Ut,g=new Ut,y=new N,m=new N;function f(_,E,P){l.fromBufferAttribute(n,_),u.fromBufferAttribute(n,E),d.fromBufferAttribute(n,P),h.fromBufferAttribute(r,_),p.fromBufferAttribute(r,E),g.fromBufferAttribute(r,P),u.sub(l),d.sub(l),p.sub(h),g.sub(h);let I=1/(p.x*g.y-g.x*p.y);isFinite(I)&&(y.copy(u).multiplyScalar(g.y).addScaledVector(d,-p.y).multiplyScalar(I),m.copy(d).multiplyScalar(p.x).addScaledVector(u,-g.x).multiplyScalar(I),o[_].add(y),o[E].add(y),o[P].add(y),c[_].add(m),c[E].add(m),c[P].add(m))}let w=this.groups;w.length===0&&(w=[{start:0,count:t.count}]);for(let _=0,E=w.length;_<E;++_){let P=w[_],I=P.start,D=P.count;for(let W=I,X=I+D;W<X;W+=3)f(t.getX(W+0),t.getX(W+1),t.getX(W+2))}let A=new N,M=new N,T=new N,b=new N;function C(_){T.fromBufferAttribute(s,_),b.copy(T);let E=o[_];A.copy(E),A.sub(T.multiplyScalar(T.dot(E))).normalize(),M.crossVectors(b,E);let I=M.dot(c[_])<0?-1:1;a.setXYZW(_,A.x,A.y,A.z,I)}for(let _=0,E=w.length;_<E;++_){let P=w[_],I=P.start,D=P.count;for(let W=I,X=I+D;W<X;W+=3)C(t.getX(W+0)),C(t.getX(W+1)),C(t.getX(W+2))}this._transformed=!0}computeVertexNormals(){let t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==e.count)n=new ze(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let h=0,p=n.count;h<p;h++)n.setXYZ(h,0,0,0);let s=new N,r=new N,a=new N,o=new N,c=new N,l=new N,u=new N,d=new N;if(t)for(let h=0,p=t.count;h<p;h+=3){let g=t.getX(h+0),y=t.getX(h+1),m=t.getX(h+2);s.fromBufferAttribute(e,g),r.fromBufferAttribute(e,y),a.fromBufferAttribute(e,m),u.subVectors(a,r),d.subVectors(s,r),u.cross(d),o.fromBufferAttribute(n,g),c.fromBufferAttribute(n,y),l.fromBufferAttribute(n,m),o.add(u),c.add(u),l.add(u),n.setXYZ(g,o.x,o.y,o.z),n.setXYZ(y,c.x,c.y,c.z),n.setXYZ(m,l.x,l.y,l.z)}else for(let h=0,p=e.count;h<p;h+=3)s.fromBufferAttribute(e,h+0),r.fromBufferAttribute(e,h+1),a.fromBufferAttribute(e,h+2),u.subVectors(a,r),d.subVectors(s,r),u.cross(d),n.setXYZ(h+0,u.x,u.y,u.z),n.setXYZ(h+1,u.x,u.y,u.z),n.setXYZ(h+2,u.x,u.y,u.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)ye.fromBufferAttribute(t,e),ye.normalize(),t.setXYZ(e,ye.x,ye.y,ye.z)}toNonIndexed(){function t(o,c){let l=o.array,u=o.itemSize,d=o.normalized,h=new l.constructor(c.length*u),p=0,g=0;for(let y=0,m=c.length;y<m;y++){o.isInterleavedBufferAttribute?p=c[y]*o.data.stride+o.offset:p=c[y]*u;for(let f=0;f<u;f++)h[g++]=l[p++]}return new ze(h,u,d)}if(this.index===null)return wt("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let e=new i,n=this.index.array,s=this.attributes;for(let o in s){let c=s[o],l=t(c,n);e.setAttribute(o,l)}let r=this.morphAttributes;for(let o in r){let c=[],l=r[o];for(let u=0,d=l.length;u<d;u++){let h=l[u],p=t(h,n);c.push(p)}e.morphAttributes[o]=c}e.morphTargetsRelative=this.morphTargetsRelative;let a=this.groups;for(let o=0,c=a.length;o<c;o++){let l=a[o];e.addGroup(l.start,l.count,l.materialIndex)}return e}toJSON(){let t={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,this.name!==""&&(t.name=this.name),Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){let c=this.parameters;for(let l in c)c[l]!==void 0&&(t[l]=c[l]);return t}t.data={attributes:{}};let e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});let n=this.attributes;for(let c in n){let l=n[c];t.data.attributes[c]=l.toJSON(t.data)}let s={},r=!1;for(let c in this.morphAttributes){let l=this.morphAttributes[c],u=[];for(let d=0,h=l.length;d<h;d++){let p=l[d];u.push(p.toJSON(t.data))}u.length>0&&(s[c]=u,r=!0)}r&&(t.data.morphAttributes=s,t.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(t.data.groups=JSON.parse(JSON.stringify(a)));let o=this.boundingSphere;return o!==null&&(t.data.boundingSphere=o.toJSON()),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let e={};this.name=t.name;let n=t.index;n!==null&&this.setIndex(n.clone());let s=t.attributes;for(let l in s){let u=s[l];this.setAttribute(l,u.clone(e))}let r=t.morphAttributes;for(let l in r){let u=[],d=r[l];for(let h=0,p=d.length;h<p;h++)u.push(d[h].clone(e));this.morphAttributes[l]=u}this.morphTargetsRelative=t.morphTargetsRelative;let a=t.groups;for(let l=0,u=a.length;l<u;l++){let d=a[l];this.addGroup(d.start,d.count,d.materialIndex)}let o=t.boundingBox;o!==null&&(this.boundingBox=o.clone());let c=t.boundingSphere;return c!==null&&(this.boundingSphere=c.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this._transformed=t._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}};var Zh=0,zn=class extends dn{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Zh++}),this.uuid=Gi(),this.name="",this.type="Material",this.blending=ni,this.side=Sn,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=rr,this.blendDst=ar,this.blendEquation=On,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Pt(0,0,0),this.blendAlpha=0,this.depthFunc=ii,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=uo,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=ti,this.stencilZFail=ti,this.stencilZPass=ti,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(let e in t){let n=t[e];if(n===void 0){wt(`Material: parameter '${e}' has value of undefined.`);continue}let s=this[e];if(s===void 0){wt(`Material: '${e}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(n):s&&s.isVector2&&n&&n.isVector2||s&&s.isEuler&&n&&n.isEuler||s&&s.isVector3&&n&&n.isVector3?s.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});let n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(t).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(t).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==ni&&(n.blending=this.blending),this.side!==Sn&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==rr&&(n.blendSrc=this.blendSrc),this.blendDst!==ar&&(n.blendDst=this.blendDst),this.blendEquation!==On&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==ii&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==uo&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==ti&&(n.stencilFail=this.stencilFail),this.stencilZFail!==ti&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==ti&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.allowOverride===!1&&(n.allowOverride=!1),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function s(r){let a=[];for(let o in r){let c=r[o];delete c.metadata,a.push(c)}return a}if(e){let r=s(t.textures),a=s(t.images);r.length>0&&(n.textures=r),a.length>0&&(n.images=a)}return n}fromJSON(t,e){if(t.uuid!==void 0&&(this.uuid=t.uuid),t.name!==void 0&&(this.name=t.name),t.color!==void 0&&this.color!==void 0&&this.color.setHex(t.color),t.roughness!==void 0&&(this.roughness=t.roughness),t.metalness!==void 0&&(this.metalness=t.metalness),t.sheen!==void 0&&(this.sheen=t.sheen),t.sheenColor!==void 0&&(this.sheenColor=new Pt().setHex(t.sheenColor)),t.sheenRoughness!==void 0&&(this.sheenRoughness=t.sheenRoughness),t.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(t.emissive),t.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(t.specular),t.specularIntensity!==void 0&&(this.specularIntensity=t.specularIntensity),t.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(t.specularColor),t.shininess!==void 0&&(this.shininess=t.shininess),t.clearcoat!==void 0&&(this.clearcoat=t.clearcoat),t.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=t.clearcoatRoughness),t.dispersion!==void 0&&(this.dispersion=t.dispersion),t.iridescence!==void 0&&(this.iridescence=t.iridescence),t.iridescenceIOR!==void 0&&(this.iridescenceIOR=t.iridescenceIOR),t.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=t.iridescenceThicknessRange),t.transmission!==void 0&&(this.transmission=t.transmission),t.thickness!==void 0&&(this.thickness=t.thickness),t.attenuationDistance!==void 0&&(this.attenuationDistance=t.attenuationDistance),t.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(t.attenuationColor),t.anisotropy!==void 0&&(this.anisotropy=t.anisotropy),t.anisotropyRotation!==void 0&&(this.anisotropyRotation=t.anisotropyRotation),t.fog!==void 0&&(this.fog=t.fog),t.flatShading!==void 0&&(this.flatShading=t.flatShading),t.blending!==void 0&&(this.blending=t.blending),t.combine!==void 0&&(this.combine=t.combine),t.side!==void 0&&(this.side=t.side),t.shadowSide!==void 0&&(this.shadowSide=t.shadowSide),t.opacity!==void 0&&(this.opacity=t.opacity),t.transparent!==void 0&&(this.transparent=t.transparent),t.alphaTest!==void 0&&(this.alphaTest=t.alphaTest),t.alphaHash!==void 0&&(this.alphaHash=t.alphaHash),t.depthFunc!==void 0&&(this.depthFunc=t.depthFunc),t.depthTest!==void 0&&(this.depthTest=t.depthTest),t.depthWrite!==void 0&&(this.depthWrite=t.depthWrite),t.colorWrite!==void 0&&(this.colorWrite=t.colorWrite),t.blendSrc!==void 0&&(this.blendSrc=t.blendSrc),t.blendDst!==void 0&&(this.blendDst=t.blendDst),t.blendEquation!==void 0&&(this.blendEquation=t.blendEquation),t.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=t.blendSrcAlpha),t.blendDstAlpha!==void 0&&(this.blendDstAlpha=t.blendDstAlpha),t.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=t.blendEquationAlpha),t.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(t.blendColor),t.blendAlpha!==void 0&&(this.blendAlpha=t.blendAlpha),t.stencilWriteMask!==void 0&&(this.stencilWriteMask=t.stencilWriteMask),t.stencilFunc!==void 0&&(this.stencilFunc=t.stencilFunc),t.stencilRef!==void 0&&(this.stencilRef=t.stencilRef),t.stencilFuncMask!==void 0&&(this.stencilFuncMask=t.stencilFuncMask),t.stencilFail!==void 0&&(this.stencilFail=t.stencilFail),t.stencilZFail!==void 0&&(this.stencilZFail=t.stencilZFail),t.stencilZPass!==void 0&&(this.stencilZPass=t.stencilZPass),t.stencilWrite!==void 0&&(this.stencilWrite=t.stencilWrite),t.wireframe!==void 0&&(this.wireframe=t.wireframe),t.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=t.wireframeLinewidth),t.wireframeLinecap!==void 0&&(this.wireframeLinecap=t.wireframeLinecap),t.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=t.wireframeLinejoin),t.rotation!==void 0&&(this.rotation=t.rotation),t.linewidth!==void 0&&(this.linewidth=t.linewidth),t.dashSize!==void 0&&(this.dashSize=t.dashSize),t.gapSize!==void 0&&(this.gapSize=t.gapSize),t.scale!==void 0&&(this.scale=t.scale),t.polygonOffset!==void 0&&(this.polygonOffset=t.polygonOffset),t.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=t.polygonOffsetFactor),t.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=t.polygonOffsetUnits),t.dithering!==void 0&&(this.dithering=t.dithering),t.alphaToCoverage!==void 0&&(this.alphaToCoverage=t.alphaToCoverage),t.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=t.premultipliedAlpha),t.forceSinglePass!==void 0&&(this.forceSinglePass=t.forceSinglePass),t.allowOverride!==void 0&&(this.allowOverride=t.allowOverride),t.visible!==void 0&&(this.visible=t.visible),t.toneMapped!==void 0&&(this.toneMapped=t.toneMapped),t.userData!==void 0&&(this.userData=t.userData),t.vertexColors!==void 0&&(typeof t.vertexColors=="number"?this.vertexColors=t.vertexColors>0:this.vertexColors=t.vertexColors),t.size!==void 0&&(this.size=t.size),t.sizeAttenuation!==void 0&&(this.sizeAttenuation=t.sizeAttenuation),t.map!==void 0&&(this.map=e[t.map]||null),t.matcap!==void 0&&(this.matcap=e[t.matcap]||null),t.alphaMap!==void 0&&(this.alphaMap=e[t.alphaMap]||null),t.bumpMap!==void 0&&(this.bumpMap=e[t.bumpMap]||null),t.bumpScale!==void 0&&(this.bumpScale=t.bumpScale),t.normalMap!==void 0&&(this.normalMap=e[t.normalMap]||null),t.normalMapType!==void 0&&(this.normalMapType=t.normalMapType),t.normalScale!==void 0){let n=t.normalScale;Array.isArray(n)===!1&&(n=[n,n]),this.normalScale=new Ut().fromArray(n)}return t.displacementMap!==void 0&&(this.displacementMap=e[t.displacementMap]||null),t.displacementScale!==void 0&&(this.displacementScale=t.displacementScale),t.displacementBias!==void 0&&(this.displacementBias=t.displacementBias),t.roughnessMap!==void 0&&(this.roughnessMap=e[t.roughnessMap]||null),t.metalnessMap!==void 0&&(this.metalnessMap=e[t.metalnessMap]||null),t.emissiveMap!==void 0&&(this.emissiveMap=e[t.emissiveMap]||null),t.emissiveIntensity!==void 0&&(this.emissiveIntensity=t.emissiveIntensity),t.specularMap!==void 0&&(this.specularMap=e[t.specularMap]||null),t.specularIntensityMap!==void 0&&(this.specularIntensityMap=e[t.specularIntensityMap]||null),t.specularColorMap!==void 0&&(this.specularColorMap=e[t.specularColorMap]||null),t.envMap!==void 0&&(this.envMap=e[t.envMap]||null),t.envMapRotation!==void 0&&this.envMapRotation.fromArray(t.envMapRotation),t.envMapIntensity!==void 0&&(this.envMapIntensity=t.envMapIntensity),t.reflectivity!==void 0&&(this.reflectivity=t.reflectivity),t.refractionRatio!==void 0&&(this.refractionRatio=t.refractionRatio),t.lightMap!==void 0&&(this.lightMap=e[t.lightMap]||null),t.lightMapIntensity!==void 0&&(this.lightMapIntensity=t.lightMapIntensity),t.aoMap!==void 0&&(this.aoMap=e[t.aoMap]||null),t.aoMapIntensity!==void 0&&(this.aoMapIntensity=t.aoMapIntensity),t.gradientMap!==void 0&&(this.gradientMap=e[t.gradientMap]||null),t.clearcoatMap!==void 0&&(this.clearcoatMap=e[t.clearcoatMap]||null),t.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=e[t.clearcoatRoughnessMap]||null),t.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=e[t.clearcoatNormalMap]||null),t.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new Ut().fromArray(t.clearcoatNormalScale)),t.iridescenceMap!==void 0&&(this.iridescenceMap=e[t.iridescenceMap]||null),t.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=e[t.iridescenceThicknessMap]||null),t.transmissionMap!==void 0&&(this.transmissionMap=e[t.transmissionMap]||null),t.thicknessMap!==void 0&&(this.thicknessMap=e[t.thicknessMap]||null),t.anisotropyMap!==void 0&&(this.anisotropyMap=e[t.anisotropyMap]||null),t.sheenColorMap!==void 0&&(this.sheenColorMap=e[t.sheenColorMap]||null),t.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=e[t.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;let e=t.clippingPlanes,n=null;if(e!==null){let s=e.length;n=new Array(s);for(let r=0;r!==s;++r)n[r]=e[r].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.allowOverride=t.allowOverride,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}};var Mn=new N,eo=new N,Xs=new N,Nn=new N,no=new N,qs=new N,io=new N,cs=class{constructor(t=new N,e=new N(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,Mn)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);let n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){let e=Mn.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(Mn.copy(this.origin).addScaledVector(this.direction,e),Mn.distanceToSquared(t))}distanceSqToSegment(t,e,n,s){eo.copy(t).add(e).multiplyScalar(.5),Xs.copy(e).sub(t).normalize(),Nn.copy(this.origin).sub(eo);let r=t.distanceTo(e)*.5,a=-this.direction.dot(Xs),o=Nn.dot(this.direction),c=-Nn.dot(Xs),l=Nn.lengthSq(),u=Math.abs(1-a*a),d,h,p,g;if(u>0)if(d=a*c-o,h=a*o-c,g=r*u,d>=0)if(h>=-g)if(h<=g){let y=1/u;d*=y,h*=y,p=d*(d+a*h+2*o)+h*(a*d+h+2*c)+l}else h=r,d=Math.max(0,-(a*h+o)),p=-d*d+h*(h+2*c)+l;else h=-r,d=Math.max(0,-(a*h+o)),p=-d*d+h*(h+2*c)+l;else h<=-g?(d=Math.max(0,-(-a*r+o)),h=d>0?-r:Math.min(Math.max(-r,-c),r),p=-d*d+h*(h+2*c)+l):h<=g?(d=0,h=Math.min(Math.max(-r,-c),r),p=h*(h+2*c)+l):(d=Math.max(0,-(a*r+o)),h=d>0?r:Math.min(Math.max(-r,-c),r),p=-d*d+h*(h+2*c)+l);else h=a>0?-r:r,d=Math.max(0,-(a*h+o)),p=-d*d+h*(h+2*c)+l;return n&&n.copy(this.origin).addScaledVector(this.direction,d),s&&s.copy(eo).addScaledVector(Xs,h),p}intersectSphere(t,e){Mn.subVectors(t.center,this.origin);let n=Mn.dot(this.direction),s=Mn.dot(Mn)-n*n,r=t.radius*t.radius;if(s>r)return null;let a=Math.sqrt(r-s),o=n-a,c=n+a;return c<0?null:o<0?this.at(c,e):this.at(o,e)}intersectsSphere(t){return t.radius<0?!1:this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){let e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){let n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){let e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,s,r,a,o,c,l=1/this.direction.x,u=1/this.direction.y,d=1/this.direction.z,h=this.origin;return l>=0?(n=(t.min.x-h.x)*l,s=(t.max.x-h.x)*l):(n=(t.max.x-h.x)*l,s=(t.min.x-h.x)*l),u>=0?(r=(t.min.y-h.y)*u,a=(t.max.y-h.y)*u):(r=(t.max.y-h.y)*u,a=(t.min.y-h.y)*u),n>a||r>s||((r>n||isNaN(n))&&(n=r),(a<s||isNaN(s))&&(s=a),d>=0?(o=(t.min.z-h.z)*d,c=(t.max.z-h.z)*d):(o=(t.max.z-h.z)*d,c=(t.min.z-h.z)*d),n>c||o>s)||((o>n||n!==n)&&(n=o),(c<s||s!==s)&&(s=c),s<0)?null:this.at(n>=0?n:s,e)}intersectsBox(t){return this.intersectBox(t,Mn)!==null}intersectTriangle(t,e,n,s,r){no.subVectors(e,t),qs.subVectors(n,t),io.crossVectors(no,qs);let a=this.direction.dot(io),o;if(a>0){if(s)return null;o=1}else if(a<0)o=-1,a=-a;else return null;Nn.subVectors(this.origin,t);let c=o*this.direction.dot(qs.crossVectors(Nn,qs));if(c<0)return null;let l=o*this.direction.dot(no.cross(Nn));if(l<0||c+l>a)return null;let u=-o*Nn.dot(io);return u<0?null:this.at(u/a,r)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},en=class extends zn{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Pt(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new En,this.combine=So,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}},Dl=new ie,Qn=new cs,Ys=new Di,Nl=new N,Zs=new N,$s=new N,Js=new N,so=new N,Ks=new N,Ul=new N,Qs=new N,me=class extends Re{constructor(t=new ke,e=new en){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let s=e[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=s.length;r<a;r++){let o=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}getVertexPosition(t,e){let n=this.geometry,s=n.attributes.position,r=n.morphAttributes.position,a=n.morphTargetsRelative;e.fromBufferAttribute(s,t);let o=this.morphTargetInfluences;if(r&&o){Ks.set(0,0,0);for(let c=0,l=r.length;c<l;c++){let u=o[c],d=r[c];u!==0&&(so.fromBufferAttribute(d,t),a?Ks.addScaledVector(so,u):Ks.addScaledVector(so.sub(e),u))}e.add(Ks)}return e}raycast(t,e){let n=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),Ys.copy(n.boundingSphere),Ys.applyMatrix4(r),Qn.copy(t.ray).recast(t.near),!(Ys.containsPoint(Qn.origin)===!1&&(Qn.intersectSphere(Ys,Nl)===null||Qn.origin.distanceToSquared(Nl)>(t.far-t.near)**2))&&(Dl.copy(r).invert(),Qn.copy(t.ray).applyMatrix4(Dl),!(n.boundingBox!==null&&Qn.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,Qn)))}_computeIntersections(t,e,n){let s,r=this.geometry,a=this.material,o=r.index,c=r.attributes.position,l=r.attributes.uv,u=r.attributes.uv1,d=r.attributes.normal,h=r.groups,p=r.drawRange;if(o!==null)if(Array.isArray(a))for(let g=0,y=h.length;g<y;g++){let m=h[g],f=a[m.materialIndex],w=Math.max(m.start,p.start),A=Math.min(o.count,Math.min(m.start+m.count,p.start+p.count));for(let M=w,T=A;M<T;M+=3){let b=o.getX(M),C=o.getX(M+1),_=o.getX(M+2);s=js(this,f,t,n,l,u,d,b,C,_),s&&(s.faceIndex=Math.floor(M/3),s.face.materialIndex=m.materialIndex,e.push(s))}}else{let g=Math.max(0,p.start),y=Math.min(o.count,p.start+p.count);for(let m=g,f=y;m<f;m+=3){let w=o.getX(m),A=o.getX(m+1),M=o.getX(m+2);s=js(this,a,t,n,l,u,d,w,A,M),s&&(s.faceIndex=Math.floor(m/3),e.push(s))}}else if(c!==void 0)if(Array.isArray(a))for(let g=0,y=h.length;g<y;g++){let m=h[g],f=a[m.materialIndex],w=Math.max(m.start,p.start),A=Math.min(c.count,Math.min(m.start+m.count,p.start+p.count));for(let M=w,T=A;M<T;M+=3){let b=M,C=M+1,_=M+2;s=js(this,f,t,n,l,u,d,b,C,_),s&&(s.faceIndex=Math.floor(M/3),s.face.materialIndex=m.materialIndex,e.push(s))}}else{let g=Math.max(0,p.start),y=Math.min(c.count,p.start+p.count);for(let m=g,f=y;m<f;m+=3){let w=m,A=m+1,M=m+2;s=js(this,a,t,n,l,u,d,w,A,M),s&&(s.faceIndex=Math.floor(m/3),e.push(s))}}}};function $h(i,t,e,n,s,r,a,o){let c;if(t.side===Ee?c=n.intersectTriangle(a,r,s,!0,o):c=n.intersectTriangle(s,r,a,t.side===Sn,o),c===null)return null;Qs.copy(o),Qs.applyMatrix4(i.matrixWorld);let l=e.ray.origin.distanceTo(Qs);return l<e.near||l>e.far?null:{distance:l,point:Qs.clone(),object:i}}function js(i,t,e,n,s,r,a,o,c,l){i.getVertexPosition(o,Zs),i.getVertexPosition(c,$s),i.getVertexPosition(l,Js);let u=$h(i,t,e,n,Zs,$s,Js,Ul);if(u){let d=new N;Fn.getBarycoord(Ul,Zs,$s,Js,d),s&&(u.uv=Fn.getInterpolatedAttribute(s,o,c,l,d,new Ut)),r&&(u.uv1=Fn.getInterpolatedAttribute(r,o,c,l,d,new Ut)),a&&(u.normal=Fn.getInterpolatedAttribute(a,o,c,l,d,new N),u.normal.dot(n.direction)>0&&u.normal.multiplyScalar(-1));let h={a:o,b:c,c:l,normal:new N,materialIndex:0};Fn.getNormal(Zs,$s,Js,h.normal),u.face=h,u.barycoord=d}return u}var yr=class extends De{constructor(t=null,e=1,n=1,s,r,a,o,c,l=Me,u=Me,d,h){super(null,a,o,c,l,u,s,r,d,h),this.isDataTexture=!0,this.image={data:t,width:e,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var ro=new N,Jh=new N,Kh=new It,qe=class{constructor(t=new N(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,s){return this.normal.set(t,e,n),this.constant=s,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){let s=ro.subVectors(n,e).cross(Jh.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(s,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){let t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e,n=!0){let s=t.delta(ro),r=this.normal.dot(s);if(r===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;let a=-(t.start.dot(this.normal)+this.constant)/r;return n===!0&&(a<0||a>1)?null:e.copy(t.start).addScaledVector(s,a)}intersectsLine(t){let e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){let n=e||Kh.getNormalMatrix(t),s=this.coplanarPoint(ro).applyMatrix4(t),r=this.normal.applyMatrix3(n).normalize();return this.constant=-s.dot(r),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}},jn=new Di,Qh=new Ut(.5,.5),tr=new N,Ni=class{constructor(t=new qe,e=new qe,n=new qe,s=new qe,r=new qe,a=new qe){this.planes=[t,e,n,s,r,a]}set(t,e,n,s,r,a){let o=this.planes;return o[0].copy(t),o[1].copy(e),o[2].copy(n),o[3].copy(s),o[4].copy(r),o[5].copy(a),this}copy(t){let e=this.planes;for(let n=0;n<6;n++)e[n].copy(t.planes[n]);return this}setFromProjectionMatrix(t,e=je,n=!1){let s=this.planes,r=t.elements,a=r[0],o=r[1],c=r[2],l=r[3],u=r[4],d=r[5],h=r[6],p=r[7],g=r[8],y=r[9],m=r[10],f=r[11],w=r[12],A=r[13],M=r[14],T=r[15];if(s[0].setComponents(l-a,p-u,f-g,T-w).normalize(),s[1].setComponents(l+a,p+u,f+g,T+w).normalize(),s[2].setComponents(l+o,p+d,f+y,T+A).normalize(),s[3].setComponents(l-o,p-d,f-y,T-A).normalize(),n)s[4].setComponents(c,h,m,M).normalize(),s[5].setComponents(l-c,p-h,f-m,T-M).normalize();else if(s[4].setComponents(l-c,p-h,f-m,T-M).normalize(),e===je)s[5].setComponents(l+c,p+h,f+m,T+M).normalize();else if(e===Ai)s[5].setComponents(c,h,m,M).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+e);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),jn.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{let e=t.geometry;e.boundingSphere===null&&e.computeBoundingSphere(),jn.copy(e.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(jn)}intersectsSprite(t){jn.center.set(0,0,0);let e=Qh.distanceTo(t.center);return jn.radius=.7071067811865476+e,jn.applyMatrix4(t.matrixWorld),this.intersectsSphere(jn)}intersectsSphere(t){let e=this.planes,n=t.center,s=-t.radius;for(let r=0;r<6;r++)if(e[r].distanceToPoint(n)<s)return!1;return!0}intersectsBox(t){let e=this.planes;for(let n=0;n<6;n++){let s=e[n];if(tr.x=s.normal.x>0?t.max.x:t.min.x,tr.y=s.normal.y>0?t.max.y:t.min.y,tr.z=s.normal.z>0?t.max.z:t.min.z,s.distanceToPoint(tr)<0)return!1}return!0}containsPoint(t){let e=this.planes;for(let n=0;n<6;n++)if(e[n].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};var hs=class extends De{constructor(t=[],e=Hn,n,s,r,a,o,c,l,u){super(t,e,n,s,r,a,o,c,l,u),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}};var wn=class extends De{constructor(t,e,n=sn,s,r,a,o=Me,c=Me,l,u=un,d=1){if(u!==un&&u!==Xn)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");let h={width:t,height:e,depth:d};super(h,s,r,a,o,c,u,n,l),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.source=new Ii(Object.assign({},t.image)),this.compareFunction=t.compareFunction,this}toJSON(t){let e=super.toJSON(t);return this.compareFunction!==null&&(e.compareFunction=this.compareFunction),e}},Mr=class extends wn{constructor(t,e=sn,n=Hn,s,r,a=Me,o=Me,c,l=un){let u={width:t,height:t,depth:1},d=[u,u,u,u,u,u];super(t,t,e,n,s,r,a,o,c,l),this.image=d,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(t){this.image=t}},us=class extends De{constructor(t=null){super(),this.sourceTexture=t,this.isExternalTexture=!0}copy(t){return super.copy(t),this.sourceTexture=t.sourceTexture,this}},Ui=class i extends ke{constructor(t=1,e=1,n=1,s=1,r=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:e,depth:n,widthSegments:s,heightSegments:r,depthSegments:a};let o=this;s=Math.floor(s),r=Math.floor(r),a=Math.floor(a);let c=[],l=[],u=[],d=[],h=0,p=0;g("z","y","x",-1,-1,n,e,t,a,r,0),g("z","y","x",1,-1,n,e,-t,a,r,1),g("x","z","y",1,1,t,n,e,s,a,2),g("x","z","y",1,-1,t,n,-e,s,a,3),g("x","y","z",1,-1,t,e,n,s,r,4),g("x","y","z",-1,-1,t,e,-n,s,r,5),this.setIndex(c),this.setAttribute("position",new ue(l,3)),this.setAttribute("normal",new ue(u,3)),this.setAttribute("uv",new ue(d,2));function g(y,m,f,w,A,M,T,b,C,_,E){let P=M/C,I=T/_,D=M/2,W=T/2,X=b/2,R=C+1,B=_+1,H=0,$=0,j=new N;for(let nt=0;nt<B;nt++){let ct=nt*I-W;for(let dt=0;dt<R;dt++){let zt=dt*P-D;j[y]=zt*w,j[m]=ct*A,j[f]=X,l.push(j.x,j.y,j.z),j[y]=0,j[m]=0,j[f]=b>0?1:-1,u.push(j.x,j.y,j.z),d.push(dt/C),d.push(1-nt/_),H+=1}}for(let nt=0;nt<_;nt++)for(let ct=0;ct<C;ct++){let dt=h+ct+R*nt,zt=h+ct+R*(nt+1),$t=h+(ct+1)+R*(nt+1),Ot=h+(ct+1)+R*nt;c.push(dt,zt,Ot),c.push(zt,$t,Ot),$+=6}o.addGroup(p,$,E),p+=$,h+=H}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}};var Fi=class i extends ke{constructor(t=1,e=1,n=1,s=32,r=1,a=!1,o=0,c=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:t,radiusBottom:e,height:n,radialSegments:s,heightSegments:r,openEnded:a,thetaStart:o,thetaLength:c};let l=this;s=Math.floor(s),r=Math.floor(r);let u=[],d=[],h=[],p=[],g=0,y=[],m=n/2,f=0;w(),a===!1&&(t>0&&A(!0),e>0&&A(!1)),this.setIndex(u),this.setAttribute("position",new ue(d,3)),this.setAttribute("normal",new ue(h,3)),this.setAttribute("uv",new ue(p,2));function w(){let M=new N,T=new N,b=0,C=(e-t)/n;for(let _=0;_<=r;_++){let E=[],P=_/r,I=P*(e-t)+t;for(let D=0;D<=s;D++){let W=D/s,X=W*c+o,R=Math.sin(X),B=Math.cos(X);T.x=I*R,T.y=-P*n+m,T.z=I*B,d.push(T.x,T.y,T.z),M.set(R,C,B).normalize(),h.push(M.x,M.y,M.z),p.push(W,1-P),E.push(g++)}y.push(E)}for(let _=0;_<s;_++)for(let E=0;E<r;E++){let P=y[E][_],I=y[E+1][_],D=y[E+1][_+1],W=y[E][_+1];(t>0||E!==0)&&(u.push(P,I,W),b+=3),(e>0||E!==r-1)&&(u.push(I,D,W),b+=3)}l.addGroup(f,b,0),f+=b}function A(M){let T=g,b=new Ut,C=new N,_=0,E=M===!0?t:e,P=M===!0?1:-1;for(let D=1;D<=s;D++)d.push(0,m*P,0),h.push(0,P,0),p.push(.5,.5),g++;let I=g;for(let D=0;D<=s;D++){let X=D/s*c+o,R=Math.cos(X),B=Math.sin(X);C.x=E*B,C.y=m*P,C.z=E*R,d.push(C.x,C.y,C.z),h.push(0,P,0),b.x=R*.5+.5,b.y=B*.5*P+.5,p.push(b.x,b.y),g++}for(let D=0;D<s;D++){let W=T+D,X=I+D;M===!0?u.push(X,X+1,W):u.push(X+1,X,W),_+=3}l.addGroup(f,_,M===!0?1:2),f+=_}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},ds=class i extends Fi{constructor(t=1,e=1,n=32,s=1,r=!1,a=0,o=Math.PI*2){super(0,t,e,n,s,r,a,o),this.type="ConeGeometry",this.parameters={radius:t,height:e,radialSegments:n,heightSegments:s,openEnded:r,thetaStart:a,thetaLength:o}}static fromJSON(t){return new i(t.radius,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}};var fs=class i extends ke{constructor(t=1,e=1,n=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:e,widthSegments:n,heightSegments:s};let r=t/2,a=e/2,o=Math.floor(n),c=Math.floor(s),l=o+1,u=c+1,d=t/o,h=e/c,p=[],g=[],y=[],m=[];for(let f=0;f<u;f++){let w=f*h-a;for(let A=0;A<l;A++){let M=A*d-r;g.push(M,-w,0),y.push(0,0,1),m.push(A/o),m.push(1-f/c)}}for(let f=0;f<c;f++)for(let w=0;w<o;w++){let A=w+l*f,M=w+l*(f+1),T=w+1+l*(f+1),b=w+1+l*f;p.push(A,M,b),p.push(M,T,b)}this.setIndex(p),this.setAttribute("position",new ue(g,3)),this.setAttribute("normal",new ue(y,3)),this.setAttribute("uv",new ue(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.width,t.height,t.widthSegments,t.heightSegments)}},ps=class i extends ke{constructor(t=.5,e=1,n=32,s=1,r=0,a=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:t,outerRadius:e,thetaSegments:n,phiSegments:s,thetaStart:r,thetaLength:a},n=Math.max(3,n),s=Math.max(1,s);let o=[],c=[],l=[],u=[],d=t,h=(e-t)/s,p=new N,g=new Ut;for(let y=0;y<=s;y++){for(let m=0;m<=n;m++){let f=r+m/n*a;p.x=d*Math.cos(f),p.y=d*Math.sin(f),c.push(p.x,p.y,p.z),l.push(0,0,1),g.x=(p.x/e+1)/2,g.y=(p.y/e+1)/2,u.push(g.x,g.y)}d+=h}for(let y=0;y<s;y++){let m=y*(n+1);for(let f=0;f<n;f++){let w=f+m,A=w,M=w+n+1,T=w+n+2,b=w+1;o.push(A,M,b),o.push(M,T,b)}}this.setIndex(o),this.setAttribute("position",new ue(c,3)),this.setAttribute("normal",new ue(l,3)),this.setAttribute("uv",new ue(u,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.innerRadius,t.outerRadius,t.thetaSegments,t.phiSegments,t.thetaStart,t.thetaLength)}};var si=class i extends ke{constructor(t=1,e=32,n=16,s=0,r=Math.PI*2,a=0,o=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:t,widthSegments:e,heightSegments:n,phiStart:s,phiLength:r,thetaStart:a,thetaLength:o},e=Math.max(3,Math.floor(e)),n=Math.max(2,Math.floor(n));let c=Math.min(a+o,Math.PI),l=0,u=[],d=new N,h=new N,p=[],g=[],y=[],m=[];for(let f=0;f<=n;f++){let w=[],A=f/n,M=a+A*o,T=t*Math.cos(M),b=Math.sqrt(t*t-T*T),C=0;f===0&&a===0?C=.5/e:f===n&&c===Math.PI&&(C=-.5/e);for(let _=0;_<=e;_++){let E=_/e,P=s+E*r;d.x=-b*Math.cos(P),d.y=T,d.z=b*Math.sin(P),g.push(d.x,d.y,d.z),h.copy(d).normalize(),y.push(h.x,h.y,h.z),m.push(E+C,1-A),w.push(l++)}u.push(w)}for(let f=0;f<n;f++)for(let w=0;w<e;w++){let A=u[f][w+1],M=u[f][w],T=u[f+1][w],b=u[f+1][w+1];(f!==0||a>0)&&p.push(A,M,b),(f!==n-1||c<Math.PI)&&p.push(M,T,b)}this.setIndex(p),this.setAttribute("position",new ue(g,3)),this.setAttribute("normal",new ue(y,3)),this.setAttribute("uv",new ue(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}};function oi(i){let t={};for(let e in i){t[e]={};for(let n in i[e]){let s=i[e][n];if(Fl(s))s.isRenderTargetTexture?(wt("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=s.clone();else if(Array.isArray(s))if(Fl(s[0])){let r=[];for(let a=0,o=s.length;a<o;a++)r[a]=s[a].clone();t[e][n]=r}else t[e][n]=s.slice();else t[e][n]=s}}return t}function Ie(i){let t={};for(let e=0;e<i.length;e++){let n=oi(i[e]);for(let s in n)t[s]=n[s]}return t}function Fl(i){return i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)}function jh(i){let t=[];for(let e=0;e<i.length;e++)t.push(i[e].clone());return t}function Go(i){let t=i.getRenderTarget();return t===null?i.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:kt.workingColorSpace}var Tc={clone:oi,merge:Ie},tu=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,eu=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,Ge=class extends zn{constructor(t){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=tu,this.fragmentShader=eu,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=oi(t.uniforms),this.uniformsGroups=jh(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this.defaultAttributeValues=Object.assign({},t.defaultAttributeValues),this.index0AttributeName=t.index0AttributeName,this.uniformsNeedUpdate=t.uniformsNeedUpdate,this}toJSON(t){let e=super.toJSON(t);e.glslVersion=this.glslVersion,e.uniforms={};for(let s in this.uniforms){let a=this.uniforms[s].value;a&&a.isTexture?e.uniforms[s]={type:"t",value:a.toJSON(t).uuid}:a&&a.isColor?e.uniforms[s]={type:"c",value:a.getHex()}:a&&a.isVector2?e.uniforms[s]={type:"v2",value:a.toArray()}:a&&a.isVector3?e.uniforms[s]={type:"v3",value:a.toArray()}:a&&a.isVector4?e.uniforms[s]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?e.uniforms[s]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?e.uniforms[s]={type:"m4",value:a.toArray()}:e.uniforms[s]={value:a}}Object.keys(this.defines).length>0&&(e.defines=this.defines),e.vertexShader=this.vertexShader,e.fragmentShader=this.fragmentShader,e.lights=this.lights,e.clipping=this.clipping;let n={};for(let s in this.extensions)this.extensions[s]===!0&&(n[s]=!0);return Object.keys(n).length>0&&(e.extensions=n),e}fromJSON(t,e){if(super.fromJSON(t,e),t.uniforms!==void 0)for(let n in t.uniforms){let s=t.uniforms[n];switch(this.uniforms[n]={},s.type){case"t":this.uniforms[n].value=e[s.value]||null;break;case"c":this.uniforms[n].value=new Pt().setHex(s.value);break;case"v2":this.uniforms[n].value=new Ut().fromArray(s.value);break;case"v3":this.uniforms[n].value=new N().fromArray(s.value);break;case"v4":this.uniforms[n].value=new se().fromArray(s.value);break;case"m3":this.uniforms[n].value=new It().fromArray(s.value);break;case"m4":this.uniforms[n].value=new ie().fromArray(s.value);break;default:this.uniforms[n].value=s.value}}if(t.defines!==void 0&&(this.defines=t.defines),t.vertexShader!==void 0&&(this.vertexShader=t.vertexShader),t.fragmentShader!==void 0&&(this.fragmentShader=t.fragmentShader),t.glslVersion!==void 0&&(this.glslVersion=t.glslVersion),t.extensions!==void 0)for(let n in t.extensions)this.extensions[n]=t.extensions[n];return t.lights!==void 0&&(this.lights=t.lights),t.clipping!==void 0&&(this.clipping=t.clipping),this}},br=class extends Ge{constructor(t){super(t),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}},ms=class extends zn{constructor(t){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new Pt(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Pt(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=ba,this.normalScale=new Ut(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new En,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.defines={STANDARD:""},this.color.copy(t.color),this.roughness=t.roughness,this.metalness=t.metalness,this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.roughnessMap=t.roughnessMap,this.metalnessMap=t.metalnessMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.envMapIntensity=t.envMapIntensity,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}};var Sr=class extends zn{constructor(t){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=fc,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}},Er=class extends zn{constructor(t){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}};function er(i,t){return!i||i.constructor===t?i:typeof t.BYTES_PER_ELEMENT=="number"?new t(i):Array.prototype.slice.call(i)}var Vn=class{constructor(t,e,n,s){this.parameterPositions=t,this._cachedIndex=0,this.resultBuffer=s!==void 0?s:new e.constructor(n),this.sampleValues=e,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(t){let e=this.parameterPositions,n=this._cachedIndex,s=e[n],r=e[n-1];n:{t:{let a;e:{i:if(!(t<s)){for(let o=n+2;;){if(s===void 0){if(t<r)break i;return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===o)break;if(r=s,s=e[++n],t<s)break t}a=e.length;break e}if(!(t>=r)){let o=e[1];t<o&&(n=2,r=o);for(let c=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===c)break;if(s=r,r=e[--n-1],t>=r)break t}a=n,n=0;break e}break n}for(;n<a;){let o=n+a>>>1;t<e[o]?a=o:n=o+1}if(s=e[n],r=e[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(s===void 0)return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,s)}return this.interpolate_(n,r,t,s)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(t){let e=this.resultBuffer,n=this.sampleValues,s=this.valueSize,r=t*s;for(let a=0;a!==s;++a)e[a]=n[r+a];return e}interpolate_(){throw new Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}},wr=class extends Vn{constructor(t,e,n,s){super(t,e,n,s),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:lo,endingEnd:lo}}intervalChanged_(t,e,n){let s=this.parameterPositions,r=t-2,a=t+1,o=s[r],c=s[a];if(o===void 0)switch(this.getSettings_().endingStart){case co:r=t,o=2*e-n;break;case ho:r=s.length-2,o=e+s[r]-s[r+1];break;default:r=t,o=n}if(c===void 0)switch(this.getSettings_().endingEnd){case co:a=t,c=2*n-e;break;case ho:a=1,c=n+s[1]-s[0];break;default:a=t-1,c=e}let l=(n-e)*.5,u=this.valueSize;this._weightPrev=l/(e-o),this._weightNext=l/(c-n),this._offsetPrev=r*u,this._offsetNext=a*u}interpolate_(t,e,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,c=t*o,l=c-o,u=this._offsetPrev,d=this._offsetNext,h=this._weightPrev,p=this._weightNext,g=(n-e)/(s-e),y=g*g,m=y*g,f=-h*m+2*h*y-h*g,w=(1+h)*m+(-1.5-2*h)*y+(-.5+h)*g+1,A=(-1-p)*m+(1.5+p)*y+.5*g,M=p*m-p*y;for(let T=0;T!==o;++T)r[T]=f*a[u+T]+w*a[l+T]+A*a[c+T]+M*a[d+T];return r}},Tr=class extends Vn{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t,e,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,c=t*o,l=c-o,u=(n-e)/(s-e),d=1-u;for(let h=0;h!==o;++h)r[h]=a[l+h]*d+a[c+h]*u;return r}},Ar=class extends Vn{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t){return this.copySampleValue_(t-1)}},Cr=class extends Vn{interpolate_(t,e,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,c=t*o,l=c-o,u=this.inTangents,d=this.outTangents;if(!u||!d){let g=(n-e)/(s-e),y=1-g;for(let m=0;m!==o;++m)r[m]=a[l+m]*y+a[c+m]*g;return r}let h=o*2,p=t-1;for(let g=0;g!==o;++g){let y=a[l+g],m=a[c+g],f=p*h+g*2,w=d[f],A=d[f+1],M=t*h+g*2,T=u[M],b=u[M+1],C=(n-e)/(s-e),_,E,P,I,D;for(let W=0;W<8;W++){_=C*C,E=_*C,P=1-C,I=P*P,D=I*P;let R=D*e+3*I*C*w+3*P*_*T+E*s-n;if(Math.abs(R)<1e-10)break;let B=3*I*(w-e)+6*P*C*(T-w)+3*_*(s-T);if(Math.abs(B)<1e-10)break;C=C-R/B,C=Math.max(0,Math.min(1,C))}r[g]=D*y+3*I*C*A+3*P*_*b+E*m}return r}},He=class{constructor(t,e,n,s){if(t===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(e===void 0||e.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+t);this.name=t,this.times=er(e,this.TimeBufferType),this.values=er(n,this.ValueBufferType),this.setInterpolation(s||this.DefaultInterpolation)}static toJSON(t){let e=t.constructor,n;if(e.toJSON!==this.toJSON)n=e.toJSON(t);else{n={name:t.name,times:er(t.times,Array),values:er(t.values,Array)};let s=t.getInterpolation();s!==t.DefaultInterpolation&&(n.interpolation=s)}return n.type=t.ValueTypeName,n}InterpolantFactoryMethodDiscrete(t){return new Ar(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodLinear(t){return new Tr(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodSmooth(t){return new wr(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodBezier(t){let e=new Cr(this.times,this.values,this.getValueSize(),t);return this.settings&&(e.inTangents=this.settings.inTangents,e.outTangents=this.settings.outTangents),e}setInterpolation(t){let e;switch(t){case ts:e=this.InterpolantFactoryMethodDiscrete;break;case gr:e=this.InterpolantFactoryMethodLinear;break;case sr:e=this.InterpolantFactoryMethodSmooth;break;case oo:e=this.InterpolantFactoryMethodBezier;break}if(e===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(t!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return wt("KeyframeTrack:",n),this}return this.createInterpolant=e,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return ts;case this.InterpolantFactoryMethodLinear:return gr;case this.InterpolantFactoryMethodSmooth:return sr;case this.InterpolantFactoryMethodBezier:return oo}}getValueSize(){return this.values.length/this.times.length}shift(t){if(t!==0){let e=this.times;for(let n=0,s=e.length;n!==s;++n)e[n]+=t}return this}scale(t){if(t!==1){let e=this.times;for(let n=0,s=e.length;n!==s;++n)e[n]*=t}return this}trim(t,e){let n=this.times,s=n.length,r=0,a=s-1;for(;r!==s&&n[r]<t;)++r;for(;a!==-1&&n[a]>e;)--a;if(++a,r!==0||a!==s){r>=a&&(a=Math.max(a,1),r=a-1);let o=this.getValueSize();this.times=n.slice(r,a),this.values=this.values.slice(r*o,a*o)}return this}validate(){let t=!0,e=this.getValueSize();e-Math.floor(e)!==0&&(Ct("KeyframeTrack: Invalid value size in track.",this),t=!1);let n=this.times,s=this.values,r=n.length;r===0&&(Ct("KeyframeTrack: Track is empty.",this),t=!1);let a=null;for(let o=0;o!==r;o++){let c=n[o];if(typeof c=="number"&&isNaN(c)){Ct("KeyframeTrack: Time is not a valid number.",this,o,c),t=!1;break}if(a!==null&&a>c){Ct("KeyframeTrack: Out of order keys.",this,o,c,a),t=!1;break}a=c}if(s!==void 0&&_h(s))for(let o=0,c=s.length;o!==c;++o){let l=s[o];if(isNaN(l)){Ct("KeyframeTrack: Value is not a valid number.",this,o,l),t=!1;break}}return t}optimize(){let t=this.times.slice(),e=this.values.slice(),n=this.getValueSize(),s=this.getInterpolation()===sr,r=t.length-1,a=1;for(let o=1;o<r;++o){let c=!1,l=t[o],u=t[o+1];if(l!==u&&(o!==1||l!==t[0]))if(s)c=!0;else{let d=o*n,h=d-n,p=d+n;for(let g=0;g!==n;++g){let y=e[d+g];if(y!==e[h+g]||y!==e[p+g]){c=!0;break}}}if(c){if(o!==a){t[a]=t[o];let d=o*n,h=a*n;for(let p=0;p!==n;++p)e[h+p]=e[d+p]}++a}}if(r>0){t[a]=t[r];for(let o=r*n,c=a*n,l=0;l!==n;++l)e[c+l]=e[o+l];++a}return a!==t.length?(this.times=t.slice(0,a),this.values=e.slice(0,a*n)):(this.times=t,this.values=e),this}clone(){let t=this.times.slice(),e=this.values.slice(),n=this.constructor,s=new n(this.name,t,e);return s.createInterpolant=this.createInterpolant,s}};He.prototype.ValueTypeName="";He.prototype.TimeBufferType=Float32Array;He.prototype.ValueBufferType=Float32Array;He.prototype.DefaultInterpolation=gr;var kn=class extends He{constructor(t,e,n){super(t,e,n)}};kn.prototype.ValueTypeName="bool";kn.prototype.ValueBufferType=Array;kn.prototype.DefaultInterpolation=ts;kn.prototype.InterpolantFactoryMethodLinear=void 0;kn.prototype.InterpolantFactoryMethodSmooth=void 0;var Rr=class extends He{constructor(t,e,n,s){super(t,e,n,s)}};Rr.prototype.ValueTypeName="color";var Ir=class extends He{constructor(t,e,n,s){super(t,e,n,s)}};Ir.prototype.ValueTypeName="number";var Pr=class extends Vn{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t,e,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,c=(n-e)/(s-e),l=t*o;for(let u=l+o;l!==u;l+=4)Ye.slerpFlat(r,0,a,l-o,a,l,c);return r}},gs=class extends He{constructor(t,e,n,s){super(t,e,n,s)}InterpolantFactoryMethodLinear(t){return new Pr(this.times,this.values,this.getValueSize(),t)}};gs.prototype.ValueTypeName="quaternion";gs.prototype.InterpolantFactoryMethodSmooth=void 0;var Gn=class extends He{constructor(t,e,n){super(t,e,n)}};Gn.prototype.ValueTypeName="string";Gn.prototype.ValueBufferType=Array;Gn.prototype.DefaultInterpolation=ts;Gn.prototype.InterpolantFactoryMethodLinear=void 0;Gn.prototype.InterpolantFactoryMethodSmooth=void 0;var Lr=class extends He{constructor(t,e,n,s){super(t,e,n,s)}};Lr.prototype.ValueTypeName="vector";var Dr=class{constructor(t,e,n){let s=this,r=!1,a=0,o=0,c,l=[];this.onStart=void 0,this.onLoad=t,this.onProgress=e,this.onError=n,this._abortController=null,this.itemStart=function(u){o++,r===!1&&s.onStart!==void 0&&s.onStart(u,a,o),r=!0},this.itemEnd=function(u){a++,s.onProgress!==void 0&&s.onProgress(u,a,o),a===o&&(r=!1,s.onLoad!==void 0&&s.onLoad())},this.itemError=function(u){s.onError!==void 0&&s.onError(u)},this.resolveURL=function(u){return u=u.normalize("NFC"),c?c(u):u},this.setURLModifier=function(u){return c=u,this},this.addHandler=function(u,d){return l.push(u,d),this},this.removeHandler=function(u){let d=l.indexOf(u);return d!==-1&&l.splice(d,2),this},this.getHandler=function(u){for(let d=0,h=l.length;d<h;d+=2){let p=l[d],g=l[d+1];if(p.global&&(p.lastIndex=0),p.test(u))return g}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||(this._abortController=new AbortController),this._abortController}},Ac=new Dr,Nr=class{constructor(t){this.manager=t!==void 0?t:Ac,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(t,e){let n=this;return new Promise(function(s,r){n.load(t,s,e,r)})}parse(){}setCrossOrigin(t){return this.crossOrigin=t,this}setWithCredentials(t){return this.withCredentials=t,this}setPath(t){return this.path=t,this}setResourcePath(t){return this.resourcePath=t,this}setRequestHeader(t){return this.requestHeader=t,this}abort(){return this}};Nr.DEFAULT_MATERIAL_NAME="__DEFAULT";var xs=class extends Re{constructor(t,e=1){super(),this.isLight=!0,this.type="Light",this.color=new Pt(t),this.intensity=e}dispose(){this.dispatchEvent({type:"dispose"})}copy(t,e){return super.copy(t,e),this.color.copy(t.color),this.intensity=t.intensity,this}toJSON(t){let e=super.toJSON(t);return e.object.color=this.color.getHex(),e.object.intensity=this.intensity,e}},_s=class extends xs{constructor(t,e,n){super(t,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(Re.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Pt(e)}copy(t,e){return super.copy(t,e),this.groundColor.copy(t.groundColor),this}toJSON(t){let e=super.toJSON(t);return e.object.groundColor=this.groundColor.getHex(),e}},ao=new ie,Ol=new N,Bl=new N,po=class{constructor(t){this.camera=t,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new Ut(512,512),this.mapType=Ne,this.map=null,this.mapPass=null,this.matrix=new ie,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Ni,this._frameExtents=new Ut(1,1),this._viewportCount=1,this._viewports=[new se(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(t){let e=this.camera,n=this.matrix;Ol.setFromMatrixPosition(t.matrixWorld),e.position.copy(Ol),Bl.setFromMatrixPosition(t.target.matrixWorld),e.lookAt(Bl),e.updateMatrixWorld(),ao.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),this._frustum.setFromProjectionMatrix(ao,e.coordinateSystem,e.reversedDepth),e.coordinateSystem===Ai||e.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(ao)}getViewport(t){return this._viewports[t]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(t){return this.camera=t.camera.clone(),this.intensity=t.intensity,this.bias=t.bias,this.radius=t.radius,this.autoUpdate=t.autoUpdate,this.needsUpdate=t.needsUpdate,this.normalBias=t.normalBias,this.blurSamples=t.blurSamples,this.mapSize.copy(t.mapSize),this.biasNode=t.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){let t={};return this.intensity!==1&&(t.intensity=this.intensity),this.bias!==0&&(t.bias=this.bias),this.normalBias!==0&&(t.normalBias=this.normalBias),this.radius!==1&&(t.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(t.mapSize=this.mapSize.toArray()),t.camera=this.camera.toJSON(!1).object,delete t.camera.matrix,t}},nr=new N,ir=new Ye,cn=new N,vs=class extends Re{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new ie,this.projectionMatrix=new ie,this.projectionMatrixInverse=new ie,this.coordinateSystem=je,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(t,e){return super.copy(t,e),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorld.decompose(nr,ir,cn),cn.x===1&&cn.y===1&&cn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(nr,ir,cn.set(1,1,1)).invert()}updateWorldMatrix(t,e,n=!1){super.updateWorldMatrix(t,e,n),this.matrixWorld.decompose(nr,ir,cn),cn.x===1&&cn.y===1&&cn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(nr,ir,cn.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}},Un=new N,zl=new Ut,Vl=new Ut,Ce=class extends vs{constructor(t=50,e=1,n=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=n,this.far=s,this.focus=10,this.aspect=e,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){let e=.5*this.getFilmHeight()/t;this.fov=Ri*2*Math.atan(e),this.updateProjectionMatrix()}getFocalLength(){let t=Math.tan(Qi*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return Ri*2*Math.atan(Math.tan(Qi*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,e,n){Un.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),e.set(Un.x,Un.y).multiplyScalar(-t/Un.z),Un.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Un.x,Un.y).multiplyScalar(-t/Un.z)}getViewSize(t,e){return this.getViewBounds(t,zl,Vl),e.subVectors(Vl,zl)}setViewOffset(t,e,n,s,r,a){this.aspect=t/e,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=this.near,e=t*Math.tan(Qi*.5*this.fov)/this.zoom,n=2*e,s=this.aspect*n,r=-.5*s,a=this.view;if(this.view!==null&&this.view.enabled){let c=a.fullWidth,l=a.fullHeight;r+=a.offsetX*s/c,e-=a.offsetY*n/l,s*=a.width/c,n*=a.height/l}let o=this.filmOffset;o!==0&&(r+=t*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,e,e-n,t,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.fov=this.fov,e.object.zoom=this.zoom,e.object.near=this.near,e.object.far=this.far,e.object.focus=this.focus,e.object.aspect=this.aspect,this.view!==null&&(e.object.view=Object.assign({},this.view)),e.object.filmGauge=this.filmGauge,e.object.filmOffset=this.filmOffset,e}};var Oi=class extends vs{constructor(t=-1,e=1,n=1,s=-1,r=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=e,this.top=n,this.bottom=s,this.near=r,this.far=a,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,e,n,s,r,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=(this.right-this.left)/(2*this.zoom),e=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,s=(this.top+this.bottom)/2,r=n-t,a=n+t,o=s+e,c=s-e;if(this.view!==null&&this.view.enabled){let l=(this.right-this.left)/this.view.fullWidth/this.zoom,u=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=l*this.view.offsetX,a=r+l*this.view.width,o-=u*this.view.offsetY,c=o-u*this.view.height}this.projectionMatrix.makeOrthographic(r,a,o,c,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.zoom=this.zoom,e.object.left=this.left,e.object.right=this.right,e.object.top=this.top,e.object.bottom=this.bottom,e.object.near=this.near,e.object.far=this.far,this.view!==null&&(e.object.view=Object.assign({},this.view)),e}},mo=class extends po{constructor(){super(new Oi(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},Bi=class extends xs{constructor(t,e){super(t,e),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(Re.DEFAULT_UP),this.updateMatrix(),this.target=new Re,this.shadow=new mo}dispose(){super.dispose(),this.shadow.dispose()}copy(t){return super.copy(t),this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}toJSON(t){let e=super.toJSON(t);return e.object.shadow=this.shadow.toJSON(),e.object.target=this.target.uuid,e}};var Si=-90,Ei=1,Ur=class extends Re{constructor(t,e,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let s=new Ce(Si,Ei,t,e);s.layers=this.layers,this.add(s);let r=new Ce(Si,Ei,t,e);r.layers=this.layers,this.add(r);let a=new Ce(Si,Ei,t,e);a.layers=this.layers,this.add(a);let o=new Ce(Si,Ei,t,e);o.layers=this.layers,this.add(o);let c=new Ce(Si,Ei,t,e);c.layers=this.layers,this.add(c);let l=new Ce(Si,Ei,t,e);l.layers=this.layers,this.add(l)}updateCoordinateSystem(){let t=this.coordinateSystem,e=this.children.concat(),[n,s,r,a,o,c]=e;for(let l of e)this.remove(l);if(t===je)n.up.set(0,1,0),n.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),c.up.set(0,1,0),c.lookAt(0,0,-1);else if(t===Ai)n.up.set(0,-1,0),n.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),c.up.set(0,-1,0),c.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(let l of e)this.add(l),l.updateMatrixWorld()}update(t,e){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:s}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());let[r,a,o,c,l,u]=this.children,d=t.getRenderTarget(),h=t.getActiveCubeFace(),p=t.getActiveMipmapLevel(),g=t.xr.enabled;t.xr.enabled=!1;let y=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let m=!1;t.isWebGLRenderer===!0?m=t.state.buffers.depth.getReversed():m=t.reversedDepthBuffer,t.setRenderTarget(n,0,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,r),t.setRenderTarget(n,1,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,a),t.setRenderTarget(n,2,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,o),t.setRenderTarget(n,3,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,c),t.setRenderTarget(n,4,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,l),n.texture.generateMipmaps=y,t.setRenderTarget(n,5,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,u),t.setRenderTarget(d,h,p),t.xr.enabled=g,n.texture.needsPMREMUpdate=!0}},Fr=class extends Ce{constructor(t=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=t}};var Ho="\\[\\]\\.:\\/",nu=new RegExp("["+Ho+"]","g"),Wo="[^"+Ho+"]",iu="[^"+Ho.replace("\\.","")+"]",su=/((?:WC+[\/:])*)/.source.replace("WC",Wo),ru=/(WCOD+)?/.source.replace("WCOD",iu),au=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Wo),ou=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Wo),lu=new RegExp("^"+su+ru+au+ou+"$"),cu=["material","materials","bones","map"],go=class{constructor(t,e,n){let s=n||ne.parseTrackName(e);this._targetGroup=t,this._bindings=t.subscribe_(e,s)}getValue(t,e){this.bind();let n=this._targetGroup.nCachedObjects_,s=this._bindings[n];s!==void 0&&s.getValue(t,e)}setValue(t,e){let n=this._bindings;for(let s=this._targetGroup.nCachedObjects_,r=n.length;s!==r;++s)n[s].setValue(t,e)}bind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].bind()}unbind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].unbind()}},ne=class i{constructor(t,e,n){this.path=e,this.parsedPath=n||i.parseTrackName(e),this.node=i.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,e,n){return t&&t.isAnimationObjectGroup?new i.Composite(t,e,n):new i(t,e,n)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace(nu,"")}static parseTrackName(t){let e=lu.exec(t);if(e===null)throw new Error("THREE.PropertyBinding: Cannot parse trackName: "+t);let n={nodeName:e[2],objectName:e[3],objectIndex:e[4],propertyName:e[5],propertyIndex:e[6]},s=n.nodeName&&n.nodeName.lastIndexOf(".");if(s!==void 0&&s!==-1){let r=n.nodeName.substring(s+1);cu.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,s),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+t);return n}static findNode(t,e){if(e===void 0||e===""||e==="."||e===-1||e===t.name||e===t.uuid)return t;if(t.skeleton){let n=t.skeleton.getBoneByName(e);if(n!==void 0)return n}if(t.children){let n=function(r){for(let a=0;a<r.length;a++){let o=r[a];if(o.name===e||o.uuid===e)return o;let c=n(o.children);if(c)return c}return null},s=n(t.children);if(s)return s}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,e){t[e]=this.targetObject[this.propertyName]}_getValue_array(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)t[e++]=n[s]}_getValue_arrayElement(t,e){t[e]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,e){this.resolvedProperty.toArray(t,e)}_setValue_direct(t,e){this.targetObject[this.propertyName]=t[e]}_setValue_direct_setNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++]}_setValue_array_setNeedsUpdate(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,e){this.resolvedProperty[this.propertyIndex]=t[e]}_setValue_arrayElement_setNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,e){this.resolvedProperty.fromArray(t,e)}_setValue_fromArray_setNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,e){this.bind(),this.getValue(t,e)}_setValue_unbound(t,e){this.bind(),this.setValue(t,e)}bind(){let t=this.node,e=this.parsedPath,n=e.objectName,s=e.propertyName,r=e.propertyIndex;if(t||(t=i.findNode(this.rootNode,e.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){wt("PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let l=e.objectIndex;switch(n){case"materials":if(!t.material){Ct("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){Ct("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){Ct("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let u=0;u<t.length;u++)if(t[u].name===l){l=u;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){Ct("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){Ct("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[n]===void 0){Ct("PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[n]}if(l!==void 0){if(t[l]===void 0){Ct("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[l]}}let a=t[s];if(a===void 0){let l=e.nodeName;Ct("PropertyBinding: Trying to update property for track: "+l+"."+s+" but it wasn't found.",t);return}let o=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?o=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let c=this.BindingType.Direct;if(r!==void 0){if(s==="morphTargetInfluences"){if(!t.geometry){Ct("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){Ct("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[r]!==void 0&&(r=t.morphTargetDictionary[r])}c=this.BindingType.ArrayElement,this.resolvedProperty=a,this.propertyIndex=r}else a.fromArray!==void 0&&a.toArray!==void 0?(c=this.BindingType.HasFromToArray,this.resolvedProperty=a):Array.isArray(a)?(c=this.BindingType.EntireArray,this.resolvedProperty=a):this.propertyName=s;this.getValue=this.GetterByBindingType[c],this.setValue=this.SetterByBindingTypeAndVersioning[c][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};ne.Composite=go;ne.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};ne.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};ne.prototype.GetterByBindingType=[ne.prototype._getValue_direct,ne.prototype._getValue_array,ne.prototype._getValue_arrayElement,ne.prototype._getValue_toArray];ne.prototype.SetterByBindingTypeAndVersioning=[[ne.prototype._setValue_direct,ne.prototype._setValue_direct_setNeedsUpdate,ne.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[ne.prototype._setValue_array,ne.prototype._setValue_array_setNeedsUpdate,ne.prototype._setValue_array_setMatrixWorldNeedsUpdate],[ne.prototype._setValue_arrayElement,ne.prototype._setValue_arrayElement_setNeedsUpdate,ne.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[ne.prototype._setValue_fromArray,ne.prototype._setValue_fromArray_setNeedsUpdate,ne.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var bg=new Float32Array(1);var kl=new ie,ys=class{constructor(t,e,n=0,s=1/0){this.ray=new cs(t,e),this.near=n,this.far=s,this.camera=null,this.layers=new Pi,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(t,e){this.ray.set(t,e)}setFromCamera(t,e){e.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(t.x,t.y,.5).unproject(e).sub(this.ray.origin).normalize(),this.camera=e):e.isOrthographicCamera?(this.ray.origin.set(t.x,t.y,e.projectionMatrix.elements[14]).unproject(e),this.ray.direction.set(0,0,-1).transformDirection(e.matrixWorld),this.camera=e):Ct("Raycaster: Unsupported camera type: "+e.type)}setFromXRController(t){return kl.identity().extractRotation(t.matrixWorld),this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(kl),this}intersectObject(t,e=!0,n=[]){return xo(t,this,n,e),n.sort(Gl),n}intersectObjects(t,e=!0,n=[]){for(let s=0,r=t.length;s<r;s++)xo(t[s],this,n,e);return n.sort(Gl),n}};function Gl(i,t){return i.distance-t.distance}function xo(i,t,e,n){let s=!0;if(i.layers.test(t.layers)&&i.raycast(t,e)===!1&&(s=!1),s===!0&&n===!0){let r=i.children;for(let a=0,o=r.length;a<o;a++)xo(r[a],t,e,!0)}}var _o=class i{static{i.prototype.isMatrix2=!0}constructor(t,e,n,s){this.elements=[1,0,0,1],t!==void 0&&this.set(t,e,n,s)}identity(){return this.set(1,0,0,1),this}fromArray(t,e=0){for(let n=0;n<4;n++)this.elements[n]=t[n+e];return this}set(t,e,n,s){let r=this.elements;return r[0]=t,r[2]=e,r[1]=n,r[3]=s,this}};function Xo(i,t,e,n){let s=hu(n);switch(e){case Fo:return i*t;case Bo:return i*t/s.components*s.byteLength;case Hr:return i*t/s.components*s.byteLength;case qn:return i*t*2/s.components*s.byteLength;case Wr:return i*t*2/s.components*s.byteLength;case Oo:return i*t*3/s.components*s.byteLength;case $e:return i*t*4/s.components*s.byteLength;case Xr:return i*t*4/s.components*s.byteLength;case Es:case ws:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case Ts:case As:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case Yr:case $r:return Math.max(i,16)*Math.max(t,8)/4;case qr:case Zr:return Math.max(i,8)*Math.max(t,8)/2;case Jr:case Kr:case jr:case ta:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case Qr:case Cs:case ea:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case na:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case ia:return Math.floor((i+4)/5)*Math.floor((t+3)/4)*16;case sa:return Math.floor((i+4)/5)*Math.floor((t+4)/5)*16;case ra:return Math.floor((i+5)/6)*Math.floor((t+4)/5)*16;case aa:return Math.floor((i+5)/6)*Math.floor((t+5)/6)*16;case oa:return Math.floor((i+7)/8)*Math.floor((t+4)/5)*16;case la:return Math.floor((i+7)/8)*Math.floor((t+5)/6)*16;case ca:return Math.floor((i+7)/8)*Math.floor((t+7)/8)*16;case ha:return Math.floor((i+9)/10)*Math.floor((t+4)/5)*16;case ua:return Math.floor((i+9)/10)*Math.floor((t+5)/6)*16;case da:return Math.floor((i+9)/10)*Math.floor((t+7)/8)*16;case fa:return Math.floor((i+9)/10)*Math.floor((t+9)/10)*16;case pa:return Math.floor((i+11)/12)*Math.floor((t+9)/10)*16;case ma:return Math.floor((i+11)/12)*Math.floor((t+11)/12)*16;case ga:case xa:case _a:return Math.ceil(i/4)*Math.ceil(t/4)*16;case va:case ya:return Math.ceil(i/4)*Math.ceil(t/4)*8;case Rs:case Ma:return Math.ceil(i/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${e} format.`)}function hu(i){switch(i){case Ne:case Lo:return{byteLength:1,components:1};case Vi:case Do:case pn:return{byteLength:2,components:1};case kr:case Gr:return{byteLength:2,components:4};case sn:case Vr:case rn:return{byteLength:4,components:1};case No:case Uo:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${i}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"185"}}));typeof window<"u"&&(window.__THREE__?wt("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="185");function Jc(){let i=null,t=!1,e=null,n=null;function s(r,a){e(r,a),n=i.requestAnimationFrame(s)}return{start:function(){t!==!0&&e!==null&&i!==null&&(n=i.requestAnimationFrame(s),t=!0)},stop:function(){i!==null&&i.cancelAnimationFrame(n),t=!1},setAnimationLoop:function(r){e=r},setContext:function(r){i=r}}}function du(i){let t=new WeakMap;function e(o,c){let l=o.array,u=o.usage,d=l.byteLength,h=i.createBuffer();i.bindBuffer(c,h),i.bufferData(c,l,u),o.onUploadCallback();let p;if(l instanceof Float32Array)p=i.FLOAT;else if(typeof Float16Array<"u"&&l instanceof Float16Array)p=i.HALF_FLOAT;else if(l instanceof Uint16Array)o.isFloat16BufferAttribute?p=i.HALF_FLOAT:p=i.UNSIGNED_SHORT;else if(l instanceof Int16Array)p=i.SHORT;else if(l instanceof Uint32Array)p=i.UNSIGNED_INT;else if(l instanceof Int32Array)p=i.INT;else if(l instanceof Int8Array)p=i.BYTE;else if(l instanceof Uint8Array)p=i.UNSIGNED_BYTE;else if(l instanceof Uint8ClampedArray)p=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+l);return{buffer:h,type:p,bytesPerElement:l.BYTES_PER_ELEMENT,version:o.version,size:d}}function n(o,c,l){let u=c.array,d=c.updateRanges;if(i.bindBuffer(l,o),d.length===0)i.bufferSubData(l,0,u);else{d.sort((p,g)=>p.start-g.start);let h=0;for(let p=1;p<d.length;p++){let g=d[h],y=d[p];y.start<=g.start+g.count+1?g.count=Math.max(g.count,y.start+y.count-g.start):(++h,d[h]=y)}d.length=h+1;for(let p=0,g=d.length;p<g;p++){let y=d[p];i.bufferSubData(l,y.start*u.BYTES_PER_ELEMENT,u,y.start,y.count)}c.clearUpdateRanges()}c.onUploadCallback()}function s(o){return o.isInterleavedBufferAttribute&&(o=o.data),t.get(o)}function r(o){o.isInterleavedBufferAttribute&&(o=o.data);let c=t.get(o);c&&(i.deleteBuffer(c.buffer),t.delete(o))}function a(o,c){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){let u=t.get(o);(!u||u.version<o.version)&&t.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}let l=t.get(o);if(l===void 0)t.set(o,e(o,c));else if(l.version<o.version){if(l.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(l.buffer,o,c),l.version=o.version}}return{get:s,remove:r,update:a}}var fu=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,pu=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,mu=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,gu=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,xu=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,_u=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,vu=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,yu=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,Mu=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,bu=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Su=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,Eu=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,wu=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,Tu=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,Au=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,Cu=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,Ru=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,Iu=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,Pu=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,Lu=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,Du=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,Nu=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,Uu=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,Fu=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,Ou=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,Bu=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,zu=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Vu=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,ku=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,Gu=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Hu="gl_FragColor = linearToOutputTexel( gl_FragColor );",Wu=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Xu=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,qu=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,Yu=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,Zu=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,$u=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,Ju=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Ku=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Qu=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,ju=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,td=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,ed=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,nd=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,id=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,sd=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,rd=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,ad=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,od=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,ld=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,cd=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,hd=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,ud=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
		vec3 iridescenceFresnelDielectric;
		vec3 iridescenceFresnelMetallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
vec3 BRDF_GGX_Multiscatter( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 singleScatter = BRDF_GGX( lightDir, viewDir, normal, material );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 dfgV = texture2D( dfgLUT, vec2( material.roughness, dotNV ) ).rg;
	vec2 dfgL = texture2D( dfgLUT, vec2( material.roughness, dotNL ) ).rg;
	vec3 FssEss_V = material.specularColorBlended * dfgV.x + material.specularF90 * dfgV.y;
	vec3 FssEss_L = material.specularColorBlended * dfgL.x + material.specularF90 * dfgL.y;
	float Ess_V = dfgV.x + dfgV.y;
	float Ess_L = dfgL.x + dfgL.y;
	float Ems_V = 1.0 - Ess_V;
	float Ems_L = 1.0 - Ess_L;
	vec3 Favg = material.specularColorBlended + ( 1.0 - material.specularColorBlended ) * 0.047619;
	vec3 Fms = FssEss_V * FssEss_L * Favg / ( 1.0 - Ems_V * Ems_L * Favg + EPSILON );
	float compensationFactor = Ems_V * Ems_L;
	vec3 multiScatter = Fms * compensationFactor;
	return singleScatter + multiScatter;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnelDielectric, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceFresnelMetallic, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,dd=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( material.iridescenceFresnelDielectric, material.iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,fd=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,pd=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,md=`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,gd=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,xd=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,_d=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,vd=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,yd=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,Md=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,bd=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,Sd=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Ed=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,wd=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,Td=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,Ad=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,Cd=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Rd=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,Id=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Pd=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,Ld=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,Dd=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Nd=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Ud=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,Fd=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,Od=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,Bd=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,zd=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,Vd=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,kd=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,Gd=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,Hd=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,Wd=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,Xd=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,qd=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,Yd=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Zd=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,$d=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,Jd=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,Kd=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,Qd=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,jd=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,tf=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,ef=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,nf=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,sf=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,rf=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,af=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,of=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,lf=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,cf=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,hf=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uf=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,df=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,ff=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,pf=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,mf=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,gf=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,xf=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,_f=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,vf=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,yf=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,Mf=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,bf=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,Sf=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,Ef=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,wf=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Tf=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Af=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Cf=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,Rf=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,If=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Pf=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Lf=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,Df=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Nf=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,Uf=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,Ff=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Of=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Bf=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,zf=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Vf=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,kf=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Gf=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,Hf=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Wf=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Xf=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,qf=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Yf=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Ft={alphahash_fragment:fu,alphahash_pars_fragment:pu,alphamap_fragment:mu,alphamap_pars_fragment:gu,alphatest_fragment:xu,alphatest_pars_fragment:_u,aomap_fragment:vu,aomap_pars_fragment:yu,batching_pars_vertex:Mu,batching_vertex:bu,begin_vertex:Su,beginnormal_vertex:Eu,bsdfs:wu,iridescence_fragment:Tu,bumpmap_pars_fragment:Au,clipping_planes_fragment:Cu,clipping_planes_pars_fragment:Ru,clipping_planes_pars_vertex:Iu,clipping_planes_vertex:Pu,color_fragment:Lu,color_pars_fragment:Du,color_pars_vertex:Nu,color_vertex:Uu,common:Fu,cube_uv_reflection_fragment:Ou,defaultnormal_vertex:Bu,displacementmap_pars_vertex:zu,displacementmap_vertex:Vu,emissivemap_fragment:ku,emissivemap_pars_fragment:Gu,colorspace_fragment:Hu,colorspace_pars_fragment:Wu,envmap_fragment:Xu,envmap_common_pars_fragment:qu,envmap_pars_fragment:Yu,envmap_pars_vertex:Zu,envmap_physical_pars_fragment:rd,envmap_vertex:$u,fog_vertex:Ju,fog_pars_vertex:Ku,fog_fragment:Qu,fog_pars_fragment:ju,gradientmap_pars_fragment:td,lightmap_pars_fragment:ed,lights_lambert_fragment:nd,lights_lambert_pars_fragment:id,lights_pars_begin:sd,lights_toon_fragment:ad,lights_toon_pars_fragment:od,lights_phong_fragment:ld,lights_phong_pars_fragment:cd,lights_physical_fragment:hd,lights_physical_pars_fragment:ud,lights_fragment_begin:dd,lights_fragment_maps:fd,lights_fragment_end:pd,lightprobes_pars_fragment:md,logdepthbuf_fragment:gd,logdepthbuf_pars_fragment:xd,logdepthbuf_pars_vertex:_d,logdepthbuf_vertex:vd,map_fragment:yd,map_pars_fragment:Md,map_particle_fragment:bd,map_particle_pars_fragment:Sd,metalnessmap_fragment:Ed,metalnessmap_pars_fragment:wd,morphinstance_vertex:Td,morphcolor_vertex:Ad,morphnormal_vertex:Cd,morphtarget_pars_vertex:Rd,morphtarget_vertex:Id,normal_fragment_begin:Pd,normal_fragment_maps:Ld,normal_pars_fragment:Dd,normal_pars_vertex:Nd,normal_vertex:Ud,normalmap_pars_fragment:Fd,clearcoat_normal_fragment_begin:Od,clearcoat_normal_fragment_maps:Bd,clearcoat_pars_fragment:zd,iridescence_pars_fragment:Vd,opaque_fragment:kd,packing:Gd,premultiplied_alpha_fragment:Hd,project_vertex:Wd,dithering_fragment:Xd,dithering_pars_fragment:qd,roughnessmap_fragment:Yd,roughnessmap_pars_fragment:Zd,shadowmap_pars_fragment:$d,shadowmap_pars_vertex:Jd,shadowmap_vertex:Kd,shadowmask_pars_fragment:Qd,skinbase_vertex:jd,skinning_pars_vertex:tf,skinning_vertex:ef,skinnormal_vertex:nf,specularmap_fragment:sf,specularmap_pars_fragment:rf,tonemapping_fragment:af,tonemapping_pars_fragment:of,transmission_fragment:lf,transmission_pars_fragment:cf,uv_pars_fragment:hf,uv_pars_vertex:uf,uv_vertex:df,worldpos_vertex:ff,background_vert:pf,background_frag:mf,backgroundCube_vert:gf,backgroundCube_frag:xf,cube_vert:_f,cube_frag:vf,depth_vert:yf,depth_frag:Mf,distance_vert:bf,distance_frag:Sf,equirect_vert:Ef,equirect_frag:wf,linedashed_vert:Tf,linedashed_frag:Af,meshbasic_vert:Cf,meshbasic_frag:Rf,meshlambert_vert:If,meshlambert_frag:Pf,meshmatcap_vert:Lf,meshmatcap_frag:Df,meshnormal_vert:Nf,meshnormal_frag:Uf,meshphong_vert:Ff,meshphong_frag:Of,meshphysical_vert:Bf,meshphysical_frag:zf,meshtoon_vert:Vf,meshtoon_frag:kf,points_vert:Gf,points_frag:Hf,shadow_vert:Wf,shadow_frag:Xf,sprite_vert:qf,sprite_frag:Yf},ut={common:{diffuse:{value:new Pt(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new It},alphaMap:{value:null},alphaMapTransform:{value:new It},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new It}},envmap:{envMap:{value:null},envMapRotation:{value:new It},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new It}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new It}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new It},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new It},normalScale:{value:new Ut(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new It},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new It}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new It}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new It}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Pt(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new N},probesMax:{value:new N},probesResolution:{value:new N}},points:{diffuse:{value:new Pt(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new It},alphaTest:{value:0},uvTransform:{value:new It}},sprite:{diffuse:{value:new Pt(16777215)},opacity:{value:1},center:{value:new Ut(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new It},alphaMap:{value:null},alphaMapTransform:{value:new It},alphaTest:{value:0}}},gn={basic:{uniforms:Ie([ut.common,ut.specularmap,ut.envmap,ut.aomap,ut.lightmap,ut.fog]),vertexShader:Ft.meshbasic_vert,fragmentShader:Ft.meshbasic_frag},lambert:{uniforms:Ie([ut.common,ut.specularmap,ut.envmap,ut.aomap,ut.lightmap,ut.emissivemap,ut.bumpmap,ut.normalmap,ut.displacementmap,ut.fog,ut.lights,{emissive:{value:new Pt(0)},envMapIntensity:{value:1}}]),vertexShader:Ft.meshlambert_vert,fragmentShader:Ft.meshlambert_frag},phong:{uniforms:Ie([ut.common,ut.specularmap,ut.envmap,ut.aomap,ut.lightmap,ut.emissivemap,ut.bumpmap,ut.normalmap,ut.displacementmap,ut.fog,ut.lights,{emissive:{value:new Pt(0)},specular:{value:new Pt(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Ft.meshphong_vert,fragmentShader:Ft.meshphong_frag},standard:{uniforms:Ie([ut.common,ut.envmap,ut.aomap,ut.lightmap,ut.emissivemap,ut.bumpmap,ut.normalmap,ut.displacementmap,ut.roughnessmap,ut.metalnessmap,ut.fog,ut.lights,{emissive:{value:new Pt(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ft.meshphysical_vert,fragmentShader:Ft.meshphysical_frag},toon:{uniforms:Ie([ut.common,ut.aomap,ut.lightmap,ut.emissivemap,ut.bumpmap,ut.normalmap,ut.displacementmap,ut.gradientmap,ut.fog,ut.lights,{emissive:{value:new Pt(0)}}]),vertexShader:Ft.meshtoon_vert,fragmentShader:Ft.meshtoon_frag},matcap:{uniforms:Ie([ut.common,ut.bumpmap,ut.normalmap,ut.displacementmap,ut.fog,{matcap:{value:null}}]),vertexShader:Ft.meshmatcap_vert,fragmentShader:Ft.meshmatcap_frag},points:{uniforms:Ie([ut.points,ut.fog]),vertexShader:Ft.points_vert,fragmentShader:Ft.points_frag},dashed:{uniforms:Ie([ut.common,ut.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ft.linedashed_vert,fragmentShader:Ft.linedashed_frag},depth:{uniforms:Ie([ut.common,ut.displacementmap]),vertexShader:Ft.depth_vert,fragmentShader:Ft.depth_frag},normal:{uniforms:Ie([ut.common,ut.bumpmap,ut.normalmap,ut.displacementmap,{opacity:{value:1}}]),vertexShader:Ft.meshnormal_vert,fragmentShader:Ft.meshnormal_frag},sprite:{uniforms:Ie([ut.sprite,ut.fog]),vertexShader:Ft.sprite_vert,fragmentShader:Ft.sprite_frag},background:{uniforms:{uvTransform:{value:new It},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ft.background_vert,fragmentShader:Ft.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new It}},vertexShader:Ft.backgroundCube_vert,fragmentShader:Ft.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ft.cube_vert,fragmentShader:Ft.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ft.equirect_vert,fragmentShader:Ft.equirect_frag},distance:{uniforms:Ie([ut.common,ut.displacementmap,{referencePosition:{value:new N},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Ft.distance_vert,fragmentShader:Ft.distance_frag},shadow:{uniforms:Ie([ut.lights,ut.fog,{color:{value:new Pt(0)},opacity:{value:1}}]),vertexShader:Ft.shadow_vert,fragmentShader:Ft.shadow_frag}};gn.physical={uniforms:Ie([gn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new It},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new It},clearcoatNormalScale:{value:new Ut(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new It},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new It},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new It},sheen:{value:0},sheenColor:{value:new Pt(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new It},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new It},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new It},transmissionSamplerSize:{value:new Ut},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new It},attenuationDistance:{value:0},attenuationColor:{value:new Pt(0)},specularColor:{value:new Pt(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new It},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new It},anisotropyVector:{value:new Ut},anisotropyMap:{value:null},anisotropyMapTransform:{value:new It}}]),vertexShader:Ft.meshphysical_vert,fragmentShader:Ft.meshphysical_frag};var wa={r:0,b:0,g:0},Zf=new ie,Kc=new It;Kc.set(-1,0,0,0,1,0,0,0,1);function $f(i,t,e,n,s,r){let a=new Pt(0),o=s===!0?0:1,c,l,u=null,d=0,h=null;function p(w){let A=w.isScene===!0?w.background:null;if(A&&A.isTexture){let M=w.backgroundBlurriness>0;A=t.get(A,M)}return A}function g(w){let A=!1,M=p(w);M===null?m(a,o):M&&M.isColor&&(m(M,1),A=!0);let T=i.xr.getEnvironmentBlendMode();T==="additive"?e.buffers.color.setClear(0,0,0,1,r):T==="alpha-blend"&&e.buffers.color.setClear(0,0,0,0,r),(i.autoClear||A)&&(e.buffers.depth.setTest(!0),e.buffers.depth.setMask(!0),e.buffers.color.setMask(!0),i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil))}function y(w,A){let M=p(A);M&&(M.isCubeTexture||M.mapping===bs)?(l===void 0&&(l=new me(new Ui(1,1,1),new Ge({name:"BackgroundCubeMaterial",uniforms:oi(gn.backgroundCube.uniforms),vertexShader:gn.backgroundCube.vertexShader,fragmentShader:gn.backgroundCube.fragmentShader,side:Ee,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),l.geometry.deleteAttribute("uv"),l.onBeforeRender=function(T,b,C){this.matrixWorld.copyPosition(C.matrixWorld)},Object.defineProperty(l.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(l)),l.material.uniforms.envMap.value=M,l.material.uniforms.backgroundBlurriness.value=A.backgroundBlurriness,l.material.uniforms.backgroundIntensity.value=A.backgroundIntensity,l.material.uniforms.backgroundRotation.value.setFromMatrix4(Zf.makeRotationFromEuler(A.backgroundRotation)).transpose(),M.isCubeTexture&&M.isRenderTargetTexture===!1&&l.material.uniforms.backgroundRotation.value.premultiply(Kc),l.material.toneMapped=kt.getTransfer(M.colorSpace)!==qt,(u!==M||d!==M.version||h!==i.toneMapping)&&(l.material.needsUpdate=!0,u=M,d=M.version,h=i.toneMapping),l.layers.enableAll(),w.unshift(l,l.geometry,l.material,0,0,null)):M&&M.isTexture&&(c===void 0&&(c=new me(new fs(2,2),new Ge({name:"BackgroundMaterial",uniforms:oi(gn.background.uniforms),vertexShader:gn.background.vertexShader,fragmentShader:gn.background.fragmentShader,side:Sn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(c)),c.material.uniforms.t2D.value=M,c.material.uniforms.backgroundIntensity.value=A.backgroundIntensity,c.material.toneMapped=kt.getTransfer(M.colorSpace)!==qt,M.matrixAutoUpdate===!0&&M.updateMatrix(),c.material.uniforms.uvTransform.value.copy(M.matrix),(u!==M||d!==M.version||h!==i.toneMapping)&&(c.material.needsUpdate=!0,u=M,d=M.version,h=i.toneMapping),c.layers.enableAll(),w.unshift(c,c.geometry,c.material,0,0,null))}function m(w,A){w.getRGB(wa,Go(i)),e.buffers.color.setClear(wa.r,wa.g,wa.b,A,r)}function f(){l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0),c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0)}return{getClearColor:function(){return a},setClearColor:function(w,A=1){a.set(w),o=A,m(a,o)},getClearAlpha:function(){return o},setClearAlpha:function(w){o=w,m(a,o)},render:g,addToRenderList:y,dispose:f}}function Jf(i,t){let e=i.getParameter(i.MAX_VERTEX_ATTRIBS),n={},s=h(null),r=s,a=!1;function o(I,D,W,X,R){let B=!1,H=d(I,X,W,D);r!==H&&(r=H,l(r.object)),B=p(I,X,W,R),B&&g(I,X,W,R),R!==null&&t.update(R,i.ELEMENT_ARRAY_BUFFER),(B||a)&&(a=!1,M(I,D,W,X),R!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,t.get(R).buffer))}function c(){return i.createVertexArray()}function l(I){return i.bindVertexArray(I)}function u(I){return i.deleteVertexArray(I)}function d(I,D,W,X){let R=X.wireframe===!0,B=n[D.id];B===void 0&&(B={},n[D.id]=B);let H=I.isInstancedMesh===!0?I.id:0,$=B[H];$===void 0&&($={},B[H]=$);let j=$[W.id];j===void 0&&(j={},$[W.id]=j);let nt=j[R];return nt===void 0&&(nt=h(c()),j[R]=nt),nt}function h(I){let D=[],W=[],X=[];for(let R=0;R<e;R++)D[R]=0,W[R]=0,X[R]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:D,enabledAttributes:W,attributeDivisors:X,object:I,attributes:{},index:null}}function p(I,D,W,X){let R=r.attributes,B=D.attributes,H=0,$=W.getAttributes();for(let j in $)if($[j].location>=0){let ct=R[j],dt=B[j];if(dt===void 0&&(j==="instanceMatrix"&&I.instanceMatrix&&(dt=I.instanceMatrix),j==="instanceColor"&&I.instanceColor&&(dt=I.instanceColor)),ct===void 0||ct.attribute!==dt||dt&&ct.data!==dt.data)return!0;H++}return r.attributesNum!==H||r.index!==X}function g(I,D,W,X){let R={},B=D.attributes,H=0,$=W.getAttributes();for(let j in $)if($[j].location>=0){let ct=B[j];ct===void 0&&(j==="instanceMatrix"&&I.instanceMatrix&&(ct=I.instanceMatrix),j==="instanceColor"&&I.instanceColor&&(ct=I.instanceColor));let dt={};dt.attribute=ct,ct&&ct.data&&(dt.data=ct.data),R[j]=dt,H++}r.attributes=R,r.attributesNum=H,r.index=X}function y(){let I=r.newAttributes;for(let D=0,W=I.length;D<W;D++)I[D]=0}function m(I){f(I,0)}function f(I,D){let W=r.newAttributes,X=r.enabledAttributes,R=r.attributeDivisors;W[I]=1,X[I]===0&&(i.enableVertexAttribArray(I),X[I]=1),R[I]!==D&&(i.vertexAttribDivisor(I,D),R[I]=D)}function w(){let I=r.newAttributes,D=r.enabledAttributes;for(let W=0,X=D.length;W<X;W++)D[W]!==I[W]&&(i.disableVertexAttribArray(W),D[W]=0)}function A(I,D,W,X,R,B,H){H===!0?i.vertexAttribIPointer(I,D,W,R,B):i.vertexAttribPointer(I,D,W,X,R,B)}function M(I,D,W,X){y();let R=X.attributes,B=W.getAttributes(),H=D.defaultAttributeValues;for(let $ in B){let j=B[$];if(j.location>=0){let nt=R[$];if(nt===void 0&&($==="instanceMatrix"&&I.instanceMatrix&&(nt=I.instanceMatrix),$==="instanceColor"&&I.instanceColor&&(nt=I.instanceColor)),nt!==void 0){let ct=nt.normalized,dt=nt.itemSize,zt=t.get(nt);if(zt===void 0)continue;let $t=zt.buffer,Ot=zt.type,Y=zt.bytesPerElement,et=Ot===i.INT||Ot===i.UNSIGNED_INT||nt.gpuType===Vr;if(nt.isInterleavedBufferAttribute){let tt=nt.data,Rt=tt.stride,Lt=nt.offset;if(tt.isInstancedInterleavedBuffer){for(let Tt=0;Tt<j.locationSize;Tt++)f(j.location+Tt,tt.meshPerAttribute);I.isInstancedMesh!==!0&&X._maxInstanceCount===void 0&&(X._maxInstanceCount=tt.meshPerAttribute*tt.count)}else for(let Tt=0;Tt<j.locationSize;Tt++)m(j.location+Tt);i.bindBuffer(i.ARRAY_BUFFER,$t);for(let Tt=0;Tt<j.locationSize;Tt++)A(j.location+Tt,dt/j.locationSize,Ot,ct,Rt*Y,(Lt+dt/j.locationSize*Tt)*Y,et)}else{if(nt.isInstancedBufferAttribute){for(let tt=0;tt<j.locationSize;tt++)f(j.location+tt,nt.meshPerAttribute);I.isInstancedMesh!==!0&&X._maxInstanceCount===void 0&&(X._maxInstanceCount=nt.meshPerAttribute*nt.count)}else for(let tt=0;tt<j.locationSize;tt++)m(j.location+tt);i.bindBuffer(i.ARRAY_BUFFER,$t);for(let tt=0;tt<j.locationSize;tt++)A(j.location+tt,dt/j.locationSize,Ot,ct,dt*Y,dt/j.locationSize*tt*Y,et)}}else if(H!==void 0){let ct=H[$];if(ct!==void 0)switch(ct.length){case 2:i.vertexAttrib2fv(j.location,ct);break;case 3:i.vertexAttrib3fv(j.location,ct);break;case 4:i.vertexAttrib4fv(j.location,ct);break;default:i.vertexAttrib1fv(j.location,ct)}}}}w()}function T(){E();for(let I in n){let D=n[I];for(let W in D){let X=D[W];for(let R in X){let B=X[R];for(let H in B)u(B[H].object),delete B[H];delete X[R]}}delete n[I]}}function b(I){if(n[I.id]===void 0)return;let D=n[I.id];for(let W in D){let X=D[W];for(let R in X){let B=X[R];for(let H in B)u(B[H].object),delete B[H];delete X[R]}}delete n[I.id]}function C(I){for(let D in n){let W=n[D];for(let X in W){let R=W[X];if(R[I.id]===void 0)continue;let B=R[I.id];for(let H in B)u(B[H].object),delete B[H];delete R[I.id]}}}function _(I){for(let D in n){let W=n[D],X=I.isInstancedMesh===!0?I.id:0,R=W[X];if(R!==void 0){for(let B in R){let H=R[B];for(let $ in H)u(H[$].object),delete H[$];delete R[B]}delete W[X],Object.keys(W).length===0&&delete n[D]}}}function E(){P(),a=!0,r!==s&&(r=s,l(r.object))}function P(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:o,reset:E,resetDefaultState:P,dispose:T,releaseStatesOfGeometry:b,releaseStatesOfObject:_,releaseStatesOfProgram:C,initAttributes:y,enableAttribute:m,disableUnusedAttributes:w}}function Kf(i,t,e){let n;function s(c){n=c}function r(c,l){i.drawArrays(n,c,l),e.update(l,n,1)}function a(c,l,u){u!==0&&(i.drawArraysInstanced(n,c,l,u),e.update(l,n,u))}function o(c,l,u){if(u===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,c,0,l,0,u);let h=0;for(let p=0;p<u;p++)h+=l[p];e.update(h,n,1)}this.setMode=s,this.render=r,this.renderInstances=a,this.renderMultiDraw=o}function Qf(i,t,e,n){let s;function r(){if(s!==void 0)return s;if(t.has("EXT_texture_filter_anisotropic")===!0){let C=t.get("EXT_texture_filter_anisotropic");s=i.getParameter(C.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function a(C){return!(C!==$e&&n.convert(C)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(C){let _=C===pn&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(C!==Ne&&n.convert(C)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE)&&C!==rn&&!_)}function c(C){if(C==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";C="mediump"}return C==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let l=e.precision!==void 0?e.precision:"highp",u=c(l);u!==l&&(wt("WebGLRenderer:",l,"not supported, using",u,"instead."),l=u);let d=e.logarithmicDepthBuffer===!0,h=e.reversedDepthBuffer===!0&&t.has("EXT_clip_control");e.reversedDepthBuffer===!0&&h===!1&&wt("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");let p=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),g=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),y=i.getParameter(i.MAX_TEXTURE_SIZE),m=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),f=i.getParameter(i.MAX_VERTEX_ATTRIBS),w=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),A=i.getParameter(i.MAX_VARYING_VECTORS),M=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),T=i.getParameter(i.MAX_SAMPLES),b=i.getParameter(i.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:c,textureFormatReadable:a,textureTypeReadable:o,precision:l,logarithmicDepthBuffer:d,reversedDepthBuffer:h,maxTextures:p,maxVertexTextures:g,maxTextureSize:y,maxCubemapSize:m,maxAttributes:f,maxVertexUniforms:w,maxVaryings:A,maxFragmentUniforms:M,maxSamples:T,samples:b}}function jf(i){let t=this,e=null,n=0,s=!1,r=!1,a=new qe,o=new It,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(d,h){let p=d.length!==0||h||n!==0||s;return s=h,n=d.length,p},this.beginShadows=function(){r=!0,u(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(d,h){e=u(d,h,0)},this.setState=function(d,h,p){let g=d.clippingPlanes,y=d.clipIntersection,m=d.clipShadows,f=i.get(d);if(!s||g===null||g.length===0||r&&!m)r?u(null):l();else{let w=r?0:n,A=w*4,M=f.clippingState||null;c.value=M,M=u(g,h,A,p);for(let T=0;T!==A;++T)M[T]=e[T];f.clippingState=M,this.numIntersection=y?this.numPlanes:0,this.numPlanes+=w}};function l(){c.value!==e&&(c.value=e,c.needsUpdate=n>0),t.numPlanes=n,t.numIntersection=0}function u(d,h,p,g){let y=d!==null?d.length:0,m=null;if(y!==0){if(m=c.value,g!==!0||m===null){let f=p+y*4,w=h.matrixWorldInverse;o.getNormalMatrix(w),(m===null||m.length<f)&&(m=new Float32Array(f));for(let A=0,M=p;A!==y;++A,M+=4)a.copy(d[A]).applyMatrix4(w,o),a.normal.toArray(m,M),m[M+3]=a.constant}c.value=m,c.needsUpdate=!0}return t.numPlanes=y,t.numIntersection=0,m}}var Yn=4,Cc=[.125,.215,.35,.446,.526,.582],li=20,tp=256,Is=new Oi,Rc=new Pt,qo=null,Yo=0,Zo=0,$o=!1,ep=new N,Aa=class{constructor(t){this._renderer=t,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(t,e=0,n=.1,s=100,r={}){let{size:a=256,position:o=ep}=r;qo=this._renderer.getRenderTarget(),Yo=this._renderer.getActiveCubeFace(),Zo=this._renderer.getActiveMipmapLevel(),$o=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);let c=this._allocateTargets();return c.depthBuffer=!0,this._sceneToCubeUV(t,n,s,c,o),e>0&&this._blur(c,0,0,e),this._applyPMREM(c),this._cleanup(c),c}fromEquirectangular(t,e=null){return this._fromTexture(t,e)}fromCubemap(t,e=null){return this._fromTexture(t,e)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Lc(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Pc(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(t){this._lodMax=Math.floor(Math.log2(t)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let t=0;t<this._lodMeshes.length;t++)this._lodMeshes[t].geometry.dispose()}_cleanup(t){this._renderer.setRenderTarget(qo,Yo,Zo),this._renderer.xr.enabled=$o,t.scissorTest=!1,Hi(t,0,0,t.width,t.height)}_fromTexture(t,e){t.mapping===Hn||t.mapping===ri?this._setSize(t.image.length===0?16:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4),qo=this._renderer.getRenderTarget(),Yo=this._renderer.getActiveCubeFace(),Zo=this._renderer.getActiveMipmapLevel(),$o=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=e||this._allocateTargets();return this._textureToCubeUV(t,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let t=3*Math.max(this._cubeSize,112),e=4*this._cubeSize,n={magFilter:Se,minFilter:Se,generateMipmaps:!1,type:pn,format:$e,colorSpace:es,depthBuffer:!1},s=Ic(t,e,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==t||this._pingPongRenderTarget.height!==e){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Ic(t,e,n);let{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=np(r)),this._blurMaterial=sp(r,t,e),this._ggxMaterial=ip(r,t,e)}return s}_compileMaterial(t){let e=new me(new ke,t);this._renderer.compile(e,Is)}_sceneToCubeUV(t,e,n,s,r){let c=new Ce(90,1,e,n),l=[1,-1,1,1,1,1],u=[1,1,1,-1,-1,-1],d=this._renderer,h=d.autoClear,p=d.toneMapping;d.getClearColor(Rc),d.toneMapping=nn,d.autoClear=!1,d.state.buffers.depth.getReversed()&&(d.setRenderTarget(s),d.clearDepth(),d.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new me(new Ui,new en({name:"PMREM.Background",side:Ee,depthWrite:!1,depthTest:!1})));let y=this._backgroundBox,m=y.material,f=!1,w=t.background;w?w.isColor&&(m.color.copy(w),t.background=null,f=!0):(m.color.copy(Rc),f=!0);for(let A=0;A<6;A++){let M=A%3;M===0?(c.up.set(0,l[A],0),c.position.set(r.x,r.y,r.z),c.lookAt(r.x+u[A],r.y,r.z)):M===1?(c.up.set(0,0,l[A]),c.position.set(r.x,r.y,r.z),c.lookAt(r.x,r.y+u[A],r.z)):(c.up.set(0,l[A],0),c.position.set(r.x,r.y,r.z),c.lookAt(r.x,r.y,r.z+u[A]));let T=this._cubeSize;Hi(s,M*T,A>2?T:0,T,T),d.setRenderTarget(s),f&&d.render(y,c),d.render(t,c)}d.toneMapping=p,d.autoClear=h,t.background=w}_textureToCubeUV(t,e){let n=this._renderer,s=t.mapping===Hn||t.mapping===ri;s?(this._cubemapMaterial===null&&(this._cubemapMaterial=Lc()),this._cubemapMaterial.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Pc());let r=s?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=r;let o=r.uniforms;o.envMap.value=t;let c=this._cubeSize;Hi(e,0,0,3*c,2*c),n.setRenderTarget(e),n.render(a,Is)}_applyPMREM(t){let e=this._renderer,n=e.autoClear;e.autoClear=!1;let s=this._lodMeshes.length;for(let r=1;r<s;r++)this._applyGGXFilter(t,r-1,r);e.autoClear=n}_applyGGXFilter(t,e,n){let s=this._renderer,r=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;let c=a.uniforms,l=n/(this._lodMeshes.length-1),u=e/(this._lodMeshes.length-1),d=Math.sqrt(l*l-u*u),h=0+l*1.25,p=d*h,{_lodMax:g}=this,y=this._sizeLods[n],m=3*y*(n>g-Yn?n-g+Yn:0),f=4*(this._cubeSize-y);c.envMap.value=t.texture,c.roughness.value=p,c.mipInt.value=g-e,Hi(r,m,f,3*y,2*y),s.setRenderTarget(r),s.render(o,Is),c.envMap.value=r.texture,c.roughness.value=0,c.mipInt.value=g-n,Hi(t,m,f,3*y,2*y),s.setRenderTarget(t),s.render(o,Is)}_blur(t,e,n,s,r){let a=this._pingPongRenderTarget;this._halfBlur(t,a,e,n,s,"latitudinal",r),this._halfBlur(a,t,n,n,s,"longitudinal",r)}_halfBlur(t,e,n,s,r,a,o){let c=this._renderer,l=this._blurMaterial;a!=="latitudinal"&&a!=="longitudinal"&&Ct("blur direction must be either latitudinal or longitudinal!");let u=3,d=this._lodMeshes[s];d.material=l;let h=l.uniforms,p=this._sizeLods[n]-1,g=isFinite(r)?Math.PI/(2*p):2*Math.PI/(2*li-1),y=r/g,m=isFinite(r)?1+Math.floor(u*y):li;m>li&&wt(`sigmaRadians, ${r}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${li}`);let f=[],w=0;for(let C=0;C<li;++C){let _=C/y,E=Math.exp(-_*_/2);f.push(E),C===0?w+=E:C<m&&(w+=2*E)}for(let C=0;C<f.length;C++)f[C]=f[C]/w;h.envMap.value=t.texture,h.samples.value=m,h.weights.value=f,h.latitudinal.value=a==="latitudinal",o&&(h.poleAxis.value=o);let{_lodMax:A}=this;h.dTheta.value=g,h.mipInt.value=A-n;let M=this._sizeLods[s],T=3*M*(s>A-Yn?s-A+Yn:0),b=4*(this._cubeSize-M);Hi(e,T,b,3*M,2*M),c.setRenderTarget(e),c.render(d,Is)}};function np(i){let t=[],e=[],n=[],s=i,r=i-Yn+1+Cc.length;for(let a=0;a<r;a++){let o=Math.pow(2,s);t.push(o);let c=1/o;a>i-Yn?c=Cc[a-i+Yn-1]:a===0&&(c=0),e.push(c);let l=1/(o-2),u=-l,d=1+l,h=[u,u,d,u,d,d,u,u,d,d,u,d],p=6,g=6,y=3,m=2,f=1,w=new Float32Array(y*g*p),A=new Float32Array(m*g*p),M=new Float32Array(f*g*p);for(let b=0;b<p;b++){let C=b%3*2/3-1,_=b>2?0:-1,E=[C,_,0,C+2/3,_,0,C+2/3,_+1,0,C,_,0,C+2/3,_+1,0,C,_+1,0];w.set(E,y*g*b),A.set(h,m*g*b);let P=[b,b,b,b,b,b];M.set(P,f*g*b)}let T=new ke;T.setAttribute("position",new ze(w,y)),T.setAttribute("uv",new ze(A,m)),T.setAttribute("faceIndex",new ze(M,f)),n.push(new me(T,null)),s>Yn&&s--}return{lodMeshes:n,sizeLods:t,sigmas:e}}function Ic(i,t,e){let n=new Ve(i,t,e);return n.texture.mapping=bs,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function Hi(i,t,e,n,s){i.viewport.set(t,e,n,s),i.scissor.set(t,e,n,s)}function ip(i,t,e){return new Ge({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:tp,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Ia(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:fn,depthTest:!1,depthWrite:!1})}function sp(i,t,e){let n=new Float32Array(li),s=new N(0,1,0);return new Ge({name:"SphericalGaussianBlur",defines:{n:li,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:s}},vertexShader:Ia(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:fn,depthTest:!1,depthWrite:!1})}function Pc(){return new Ge({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Ia(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:fn,depthTest:!1,depthWrite:!1})}function Lc(){return new Ge({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Ia(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:fn,depthTest:!1,depthWrite:!1})}function Ia(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}var Ca=class extends Ve{constructor(t=1,e={}){super(t,t,e),this.isWebGLCubeRenderTarget=!0;let n={width:t,height:t,depth:1},s=[n,n,n,n,n,n];this.texture=new hs(s),this._setTextureOptions(e),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(t,e){this.texture.type=e.type,this.texture.colorSpace=e.colorSpace,this.texture.generateMipmaps=e.generateMipmaps,this.texture.minFilter=e.minFilter,this.texture.magFilter=e.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},s=new Ui(5,5,5),r=new Ge({name:"CubemapFromEquirect",uniforms:oi(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Ee,blending:fn});r.uniforms.tEquirect.value=e;let a=new me(s,r),o=e.minFilter;return e.minFilter===Wn&&(e.minFilter=Se),new Ur(1,10,this).update(t,a),e.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(t,e=!0,n=!0,s=!0){let r=t.getRenderTarget();for(let a=0;a<6;a++)t.setRenderTarget(this,a),t.clear(e,n,s);t.setRenderTarget(r)}};function rp(i){let t=new WeakMap,e=new WeakMap,n=null;function s(h,p=!1){return h==null?null:p?a(h):r(h)}function r(h){if(h&&h.isTexture){let p=h.mapping;if(p===Or||p===Br)if(t.has(h)){let g=t.get(h).texture;return o(g,h.mapping)}else{let g=h.image;if(g&&g.height>0){let y=new Ca(g.height);return y.fromEquirectangularTexture(i,h),t.set(h,y),h.addEventListener("dispose",l),o(y.texture,h.mapping)}else return null}}return h}function a(h){if(h&&h.isTexture){let p=h.mapping,g=p===Or||p===Br,y=p===Hn||p===ri;if(g||y){let m=e.get(h),f=m!==void 0?m.texture.pmremVersion:0;if(h.isRenderTargetTexture&&h.pmremVersion!==f)return n===null&&(n=new Aa(i)),m=g?n.fromEquirectangular(h,m):n.fromCubemap(h,m),m.texture.pmremVersion=h.pmremVersion,e.set(h,m),m.texture;if(m!==void 0)return m.texture;{let w=h.image;return g&&w&&w.height>0||y&&w&&c(w)?(n===null&&(n=new Aa(i)),m=g?n.fromEquirectangular(h):n.fromCubemap(h),m.texture.pmremVersion=h.pmremVersion,e.set(h,m),h.addEventListener("dispose",u),m.texture):null}}}return h}function o(h,p){return p===Or?h.mapping=Hn:p===Br&&(h.mapping=ri),h}function c(h){let p=0,g=6;for(let y=0;y<g;y++)h[y]!==void 0&&p++;return p===g}function l(h){let p=h.target;p.removeEventListener("dispose",l);let g=t.get(p);g!==void 0&&(t.delete(p),g.dispose())}function u(h){let p=h.target;p.removeEventListener("dispose",u);let g=e.get(p);g!==void 0&&(e.delete(p),g.dispose())}function d(){t=new WeakMap,e=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:s,dispose:d}}function ap(i){let t={};function e(n){if(t[n]!==void 0)return t[n];let s=i.getExtension(n);return t[n]=s,s}return{has:function(n){return e(n)!==null},init:function(){e("EXT_color_buffer_float"),e("WEBGL_clip_cull_distance"),e("OES_texture_float_linear"),e("EXT_color_buffer_half_float"),e("WEBGL_multisampled_render_to_texture"),e("WEBGL_render_shared_exponent")},get:function(n){let s=e(n);return s===null&&ei("WebGLRenderer: "+n+" extension not supported."),s}}}function op(i,t,e,n){let s={},r=new WeakMap;function a(d){let h=d.target;h.index!==null&&t.remove(h.index);for(let g in h.attributes)t.remove(h.attributes[g]);h.removeEventListener("dispose",a),delete s[h.id];let p=r.get(h);p&&(t.remove(p),r.delete(h)),n.releaseStatesOfGeometry(h),h.isInstancedBufferGeometry===!0&&delete h._maxInstanceCount,e.memory.geometries--}function o(d,h){return s[h.id]===!0||(h.addEventListener("dispose",a),s[h.id]=!0,e.memory.geometries++),h}function c(d){let h=d.attributes;for(let p in h)t.update(h[p],i.ARRAY_BUFFER)}function l(d){let h=[],p=d.index,g=d.attributes.position,y=0;if(g===void 0)return;if(p!==null){let w=p.array;y=p.version;for(let A=0,M=w.length;A<M;A+=3){let T=w[A+0],b=w[A+1],C=w[A+2];h.push(T,b,b,C,C,T)}}else{let w=g.array;y=g.version;for(let A=0,M=w.length/3-1;A<M;A+=3){let T=A+0,b=A+1,C=A+2;h.push(T,b,b,C,C,T)}}let m=new(g.count>=65535?ls:os)(h,1);m.version=y;let f=r.get(d);f&&t.remove(f),r.set(d,m)}function u(d){let h=r.get(d);if(h){let p=d.index;p!==null&&h.version<p.version&&l(d)}else l(d);return r.get(d)}return{get:o,update:c,getWireframeAttribute:u}}function lp(i,t,e){let n;function s(d){n=d}let r,a;function o(d){r=d.type,a=d.bytesPerElement}function c(d,h){i.drawElements(n,h,r,d*a),e.update(h,n,1)}function l(d,h,p){p!==0&&(i.drawElementsInstanced(n,h,r,d*a,p),e.update(h,n,p))}function u(d,h,p){if(p===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,h,0,r,d,0,p);let y=0;for(let m=0;m<p;m++)y+=h[m];e.update(y,n,1)}this.setMode=s,this.setIndex=o,this.render=c,this.renderInstances=l,this.renderMultiDraw=u}function cp(i){let t={geometries:0,textures:0},e={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,a,o){switch(e.calls++,a){case i.TRIANGLES:e.triangles+=o*(r/3);break;case i.LINES:e.lines+=o*(r/2);break;case i.LINE_STRIP:e.lines+=o*(r-1);break;case i.LINE_LOOP:e.lines+=o*r;break;case i.POINTS:e.points+=o*r;break;default:Ct("WebGLInfo: Unknown draw mode:",a);break}}function s(){e.calls=0,e.triangles=0,e.points=0,e.lines=0}return{memory:t,render:e,programs:null,autoReset:!0,reset:s,update:n}}function hp(i,t,e){let n=new WeakMap,s=new se;function r(a,o,c){let l=a.morphTargetInfluences,u=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,d=u!==void 0?u.length:0,h=n.get(o);if(h===void 0||h.count!==d){let E=function(){C.dispose(),n.delete(o),o.removeEventListener("dispose",E)};h!==void 0&&h.texture.dispose();let p=o.morphAttributes.position!==void 0,g=o.morphAttributes.normal!==void 0,y=o.morphAttributes.color!==void 0,m=o.morphAttributes.position||[],f=o.morphAttributes.normal||[],w=o.morphAttributes.color||[],A=0;p===!0&&(A=1),g===!0&&(A=2),y===!0&&(A=3);let M=o.attributes.position.count*A,T=1;M>t.maxTextureSize&&(T=Math.ceil(M/t.maxTextureSize),M=t.maxTextureSize);let b=new Float32Array(M*T*4*d),C=new ss(b,M,T,d);C.type=rn,C.needsUpdate=!0;let _=A*4;for(let P=0;P<d;P++){let I=m[P],D=f[P],W=w[P],X=M*T*4*P;for(let R=0;R<I.count;R++){let B=R*_;p===!0&&(s.fromBufferAttribute(I,R),b[X+B+0]=s.x,b[X+B+1]=s.y,b[X+B+2]=s.z,b[X+B+3]=0),g===!0&&(s.fromBufferAttribute(D,R),b[X+B+4]=s.x,b[X+B+5]=s.y,b[X+B+6]=s.z,b[X+B+7]=0),y===!0&&(s.fromBufferAttribute(W,R),b[X+B+8]=s.x,b[X+B+9]=s.y,b[X+B+10]=s.z,b[X+B+11]=W.itemSize===4?s.w:1)}}h={count:d,texture:C,size:new Ut(M,T)},n.set(o,h),o.addEventListener("dispose",E)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)c.getUniforms().setValue(i,"morphTexture",a.morphTexture,e);else{let p=0;for(let y=0;y<l.length;y++)p+=l[y];let g=o.morphTargetsRelative?1:1-p;c.getUniforms().setValue(i,"morphTargetBaseInfluence",g),c.getUniforms().setValue(i,"morphTargetInfluences",l)}c.getUniforms().setValue(i,"morphTargetsTexture",h.texture,e),c.getUniforms().setValue(i,"morphTargetsTextureSize",h.size)}return{update:r}}function up(i,t,e,n,s){let r=new WeakMap;function a(l){let u=s.render.frame,d=l.geometry,h=t.get(l,d);if(r.get(h)!==u&&(t.update(h),r.set(h,u)),l.isInstancedMesh&&(l.hasEventListener("dispose",c)===!1&&l.addEventListener("dispose",c),r.get(l)!==u&&(e.update(l.instanceMatrix,i.ARRAY_BUFFER),l.instanceColor!==null&&e.update(l.instanceColor,i.ARRAY_BUFFER),r.set(l,u))),l.isSkinnedMesh){let p=l.skeleton;r.get(p)!==u&&(p.update(),r.set(p,u))}return h}function o(){r=new WeakMap}function c(l){let u=l.target;u.removeEventListener("dispose",c),n.releaseStatesOfObject(u),e.remove(u.instanceMatrix),u.instanceColor!==null&&e.remove(u.instanceColor)}return{update:a,dispose:o}}var dp={[Eo]:"LINEAR_TONE_MAPPING",[wo]:"REINHARD_TONE_MAPPING",[To]:"CINEON_TONE_MAPPING",[Ao]:"ACES_FILMIC_TONE_MAPPING",[Ro]:"AGX_TONE_MAPPING",[Io]:"NEUTRAL_TONE_MAPPING",[Co]:"CUSTOM_TONE_MAPPING"};function fp(i,t,e,n,s,r){let a=new Ve(t,e,{type:i,depthBuffer:s,stencilBuffer:r,samples:n?4:0,depthTexture:s?new wn(t,e):void 0}),o=new Ve(t,e,{type:pn,depthBuffer:!1,stencilBuffer:!1}),c=new ke;c.setAttribute("position",new ue([-1,3,0,-1,-1,0,3,-1,0],3)),c.setAttribute("uv",new ue([0,2,0,0,2,0],2));let l=new br({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),u=new me(c,l),d=new Oi(-1,1,1,-1,0,1),h=null,p=null,g=!1,y,m=null,f=[],w=!1;this.setSize=function(A,M){a.setSize(A,M),o.setSize(A,M);for(let T=0;T<f.length;T++){let b=f[T];b.setSize&&b.setSize(A,M)}},this.setEffects=function(A){f=A,w=f.length>0&&f[0].isRenderPass===!0;let M=a.width,T=a.height;for(let b=0;b<f.length;b++){let C=f[b];C.setSize&&C.setSize(M,T)}},this.begin=function(A,M){if(g||A.toneMapping===nn&&f.length===0)return!1;if(m=M,M!==null){let T=M.width,b=M.height;(a.width!==T||a.height!==b)&&this.setSize(T,b)}return w===!1&&A.setRenderTarget(a),y=A.toneMapping,A.toneMapping=nn,!0},this.hasRenderPass=function(){return w},this.end=function(A,M){A.toneMapping=y,g=!0;let T=a,b=o;for(let C=0;C<f.length;C++){let _=f[C];if(_.enabled!==!1&&(_.render(A,b,T,M),_.needsSwap!==!1)){let E=T;T=b,b=E}}if(h!==A.outputColorSpace||p!==A.toneMapping){h=A.outputColorSpace,p=A.toneMapping,l.defines={},kt.getTransfer(h)===qt&&(l.defines.SRGB_TRANSFER="");let C=dp[p];C&&(l.defines[C]=""),l.needsUpdate=!0}l.uniforms.tDiffuse.value=T.texture,A.setRenderTarget(m),A.render(u,d),m=null,g=!1},this.isCompositing=function(){return g},this.dispose=function(){a.depthTexture&&a.depthTexture.dispose(),a.dispose(),o.dispose(),c.dispose(),l.dispose()}}var Qc=new De,Qo=new wn(1,1),jc=new ss,th=new vr,eh=new hs,Dc=[],Nc=[],Uc=new Float32Array(16),Fc=new Float32Array(9),Oc=new Float32Array(4);function Xi(i,t,e){let n=i[0];if(n<=0||n>0)return i;let s=t*e,r=Dc[s];if(r===void 0&&(r=new Float32Array(s),Dc[s]=r),t!==0){n.toArray(r,0);for(let a=1,o=0;a!==t;++a)o+=e,i[a].toArray(r,o)}return r}function xe(i,t){if(i.length!==t.length)return!1;for(let e=0,n=i.length;e<n;e++)if(i[e]!==t[e])return!1;return!0}function _e(i,t){for(let e=0,n=t.length;e<n;e++)i[e]=t[e]}function Pa(i,t){let e=Nc[t];e===void 0&&(e=new Int32Array(t),Nc[t]=e);for(let n=0;n!==t;++n)e[n]=i.allocateTextureUnit();return e}function pp(i,t){let e=this.cache;e[0]!==t&&(i.uniform1f(this.addr,t),e[0]=t)}function mp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2f(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(xe(e,t))return;i.uniform2fv(this.addr,t),_e(e,t)}}function gp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3f(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else if(t.r!==void 0)(e[0]!==t.r||e[1]!==t.g||e[2]!==t.b)&&(i.uniform3f(this.addr,t.r,t.g,t.b),e[0]=t.r,e[1]=t.g,e[2]=t.b);else{if(xe(e,t))return;i.uniform3fv(this.addr,t),_e(e,t)}}function xp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4f(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(xe(e,t))return;i.uniform4fv(this.addr,t),_e(e,t)}}function _p(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(xe(e,t))return;i.uniformMatrix2fv(this.addr,!1,t),_e(e,t)}else{if(xe(e,n))return;Oc.set(n),i.uniformMatrix2fv(this.addr,!1,Oc),_e(e,n)}}function vp(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(xe(e,t))return;i.uniformMatrix3fv(this.addr,!1,t),_e(e,t)}else{if(xe(e,n))return;Fc.set(n),i.uniformMatrix3fv(this.addr,!1,Fc),_e(e,n)}}function yp(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(xe(e,t))return;i.uniformMatrix4fv(this.addr,!1,t),_e(e,t)}else{if(xe(e,n))return;Uc.set(n),i.uniformMatrix4fv(this.addr,!1,Uc),_e(e,n)}}function Mp(i,t){let e=this.cache;e[0]!==t&&(i.uniform1i(this.addr,t),e[0]=t)}function bp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2i(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(xe(e,t))return;i.uniform2iv(this.addr,t),_e(e,t)}}function Sp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3i(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(xe(e,t))return;i.uniform3iv(this.addr,t),_e(e,t)}}function Ep(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4i(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(xe(e,t))return;i.uniform4iv(this.addr,t),_e(e,t)}}function wp(i,t){let e=this.cache;e[0]!==t&&(i.uniform1ui(this.addr,t),e[0]=t)}function Tp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2ui(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(xe(e,t))return;i.uniform2uiv(this.addr,t),_e(e,t)}}function Ap(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3ui(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(xe(e,t))return;i.uniform3uiv(this.addr,t),_e(e,t)}}function Cp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4ui(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(xe(e,t))return;i.uniform4uiv(this.addr,t),_e(e,t)}}function Rp(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_2D_SHADOW?(Qo.compareFunction=e.isReversedDepthBuffer()?Ea:Sa,r=Qo):r=Qc,e.setTexture2D(t||r,s)}function Ip(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture3D(t||th,s)}function Pp(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTextureCube(t||eh,s)}function Lp(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture2DArray(t||jc,s)}function Dp(i){switch(i){case 5126:return pp;case 35664:return mp;case 35665:return gp;case 35666:return xp;case 35674:return _p;case 35675:return vp;case 35676:return yp;case 5124:case 35670:return Mp;case 35667:case 35671:return bp;case 35668:case 35672:return Sp;case 35669:case 35673:return Ep;case 5125:return wp;case 36294:return Tp;case 36295:return Ap;case 36296:return Cp;case 35678:case 36198:case 36298:case 36306:case 35682:return Rp;case 35679:case 36299:case 36307:return Ip;case 35680:case 36300:case 36308:case 36293:return Pp;case 36289:case 36303:case 36311:case 36292:return Lp}}function Np(i,t){i.uniform1fv(this.addr,t)}function Up(i,t){let e=Xi(t,this.size,2);i.uniform2fv(this.addr,e)}function Fp(i,t){let e=Xi(t,this.size,3);i.uniform3fv(this.addr,e)}function Op(i,t){let e=Xi(t,this.size,4);i.uniform4fv(this.addr,e)}function Bp(i,t){let e=Xi(t,this.size,4);i.uniformMatrix2fv(this.addr,!1,e)}function zp(i,t){let e=Xi(t,this.size,9);i.uniformMatrix3fv(this.addr,!1,e)}function Vp(i,t){let e=Xi(t,this.size,16);i.uniformMatrix4fv(this.addr,!1,e)}function kp(i,t){i.uniform1iv(this.addr,t)}function Gp(i,t){i.uniform2iv(this.addr,t)}function Hp(i,t){i.uniform3iv(this.addr,t)}function Wp(i,t){i.uniform4iv(this.addr,t)}function Xp(i,t){i.uniform1uiv(this.addr,t)}function qp(i,t){i.uniform2uiv(this.addr,t)}function Yp(i,t){i.uniform3uiv(this.addr,t)}function Zp(i,t){i.uniform4uiv(this.addr,t)}function $p(i,t,e){let n=this.cache,s=t.length,r=Pa(e,s);xe(n,r)||(i.uniform1iv(this.addr,r),_e(n,r));let a;this.type===i.SAMPLER_2D_SHADOW?a=Qo:a=Qc;for(let o=0;o!==s;++o)e.setTexture2D(t[o]||a,r[o])}function Jp(i,t,e){let n=this.cache,s=t.length,r=Pa(e,s);xe(n,r)||(i.uniform1iv(this.addr,r),_e(n,r));for(let a=0;a!==s;++a)e.setTexture3D(t[a]||th,r[a])}function Kp(i,t,e){let n=this.cache,s=t.length,r=Pa(e,s);xe(n,r)||(i.uniform1iv(this.addr,r),_e(n,r));for(let a=0;a!==s;++a)e.setTextureCube(t[a]||eh,r[a])}function Qp(i,t,e){let n=this.cache,s=t.length,r=Pa(e,s);xe(n,r)||(i.uniform1iv(this.addr,r),_e(n,r));for(let a=0;a!==s;++a)e.setTexture2DArray(t[a]||jc,r[a])}function jp(i){switch(i){case 5126:return Np;case 35664:return Up;case 35665:return Fp;case 35666:return Op;case 35674:return Bp;case 35675:return zp;case 35676:return Vp;case 5124:case 35670:return kp;case 35667:case 35671:return Gp;case 35668:case 35672:return Hp;case 35669:case 35673:return Wp;case 5125:return Xp;case 36294:return qp;case 36295:return Yp;case 36296:return Zp;case 35678:case 36198:case 36298:case 36306:case 35682:return $p;case 35679:case 36299:case 36307:return Jp;case 35680:case 36300:case 36308:case 36293:return Kp;case 36289:case 36303:case 36311:case 36292:return Qp}}var jo=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.setValue=Dp(e.type)}},tl=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.size=e.size,this.setValue=jp(e.type)}},el=class{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,e,n){let s=this.seq;for(let r=0,a=s.length;r!==a;++r){let o=s[r];o.setValue(t,e[o.id],n)}}},Jo=/(\w+)(\])?(\[|\.)?/g;function Bc(i,t){i.seq.push(t),i.map[t.id]=t}function tm(i,t,e){let n=i.name,s=n.length;for(Jo.lastIndex=0;;){let r=Jo.exec(n),a=Jo.lastIndex,o=r[1],c=r[2]==="]",l=r[3];if(c&&(o=o|0),l===void 0||l==="["&&a+2===s){Bc(e,l===void 0?new jo(o,i,t):new tl(o,i,t));break}else{let d=e.map[o];d===void 0&&(d=new el(o),Bc(e,d)),e=d}}}var Wi=class{constructor(t,e){this.seq=[],this.map={};let n=t.getProgramParameter(e,t.ACTIVE_UNIFORMS);for(let a=0;a<n;++a){let o=t.getActiveUniform(e,a),c=t.getUniformLocation(e,o.name);tm(o,c,this)}let s=[],r=[];for(let a of this.seq)a.type===t.SAMPLER_2D_SHADOW||a.type===t.SAMPLER_CUBE_SHADOW||a.type===t.SAMPLER_2D_ARRAY_SHADOW?s.push(a):r.push(a);s.length>0&&(this.seq=s.concat(r))}setValue(t,e,n,s){let r=this.map[e];r!==void 0&&r.setValue(t,n,s)}setOptional(t,e,n){let s=e[n];s!==void 0&&this.setValue(t,n,s)}static upload(t,e,n,s){for(let r=0,a=e.length;r!==a;++r){let o=e[r],c=n[o.id];c.needsUpdate!==!1&&o.setValue(t,c.value,s)}}static seqWithValue(t,e){let n=[];for(let s=0,r=t.length;s!==r;++s){let a=t[s];a.id in e&&n.push(a)}return n}};function zc(i,t,e){let n=i.createShader(t);return i.shaderSource(n,e),i.compileShader(n),n}var em=37297,nm=0;function im(i,t){let e=i.split(`
`),n=[],s=Math.max(t-6,0),r=Math.min(t+6,e.length);for(let a=s;a<r;a++){let o=a+1;n.push(`${o===t?">":" "} ${o}: ${e[a]}`)}return n.join(`
`)}var Vc=new It;function sm(i){kt._getMatrix(Vc,kt.workingColorSpace,i);let t=`mat3( ${Vc.elements.map(e=>e.toFixed(4))} )`;switch(kt.getTransfer(i)){case ns:return[t,"LinearTransferOETF"];case qt:return[t,"sRGBTransferOETF"];default:return wt("WebGLProgram: Unsupported color space: ",i),[t,"LinearTransferOETF"]}}function kc(i,t,e){let n=i.getShaderParameter(t,i.COMPILE_STATUS),r=(i.getShaderInfoLog(t)||"").trim();if(n&&r==="")return"";let a=/ERROR: 0:(\d+)/.exec(r);if(a){let o=parseInt(a[1]);return e.toUpperCase()+`

`+r+`

`+im(i.getShaderSource(t),o)}else return r}function rm(i,t){let e=sm(t);return[`vec4 ${i}( vec4 value ) {`,`	return ${e[1]}( vec4( value.rgb * ${e[0]}, value.a ) );`,"}"].join(`
`)}var am={[Eo]:"Linear",[wo]:"Reinhard",[To]:"Cineon",[Ao]:"ACESFilmic",[Ro]:"AgX",[Io]:"Neutral",[Co]:"Custom"};function om(i,t){let e=am[t];return e===void 0?(wt("WebGLProgram: Unsupported toneMapping:",t),"vec3 "+i+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+i+"( vec3 color ) { return "+e+"ToneMapping( color ); }"}var Ta=new N;function lm(){kt.getLuminanceCoefficients(Ta);let i=Ta.x.toFixed(4),t=Ta.y.toFixed(4),e=Ta.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${i}, ${t}, ${e} );`,"	return dot( weights, rgb );","}"].join(`
`)}function cm(i){return[i.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",i.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Ls).join(`
`)}function hm(i){let t=[];for(let e in i){let n=i[e];n!==!1&&t.push("#define "+e+" "+n)}return t.join(`
`)}function um(i,t){let e={},n=i.getProgramParameter(t,i.ACTIVE_ATTRIBUTES);for(let s=0;s<n;s++){let r=i.getActiveAttrib(t,s),a=r.name,o=1;r.type===i.FLOAT_MAT2&&(o=2),r.type===i.FLOAT_MAT3&&(o=3),r.type===i.FLOAT_MAT4&&(o=4),e[a]={type:r.type,location:i.getAttribLocation(t,a),locationSize:o}}return e}function Ls(i){return i!==""}function Gc(i,t){let e=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return i.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,e).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function Hc(i,t){return i.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var dm=/^[ \t]*#include +<([\w\d./]+)>/gm;function nl(i){return i.replace(dm,pm)}var fm=new Map;function pm(i,t){let e=Ft[t];if(e===void 0){let n=fm.get(t);if(n!==void 0)e=Ft[n],wt('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,n);else throw new Error("THREE.WebGLProgram: Can not resolve #include <"+t+">")}return nl(e)}var mm=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Wc(i){return i.replace(mm,gm)}function gm(i,t,e,n){let s="";for(let r=parseInt(t);r<parseInt(e);r++)s+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function Xc(i){let t=`precision ${i.precision} float;
	precision ${i.precision} int;
	precision ${i.precision} sampler2D;
	precision ${i.precision} samplerCube;
	precision ${i.precision} sampler3D;
	precision ${i.precision} sampler2DArray;
	precision ${i.precision} sampler2DShadow;
	precision ${i.precision} samplerCubeShadow;
	precision ${i.precision} sampler2DArrayShadow;
	precision ${i.precision} isampler2D;
	precision ${i.precision} isampler3D;
	precision ${i.precision} isamplerCube;
	precision ${i.precision} isampler2DArray;
	precision ${i.precision} usampler2D;
	precision ${i.precision} usampler3D;
	precision ${i.precision} usamplerCube;
	precision ${i.precision} usampler2DArray;
	`;return i.precision==="highp"?t+=`
#define HIGH_PRECISION`:i.precision==="mediump"?t+=`
#define MEDIUM_PRECISION`:i.precision==="lowp"&&(t+=`
#define LOW_PRECISION`),t}var xm={[Ms]:"SHADOWMAP_TYPE_PCF",[zi]:"SHADOWMAP_TYPE_VSM"};function _m(i){return xm[i.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}var vm={[Hn]:"ENVMAP_TYPE_CUBE",[ri]:"ENVMAP_TYPE_CUBE",[bs]:"ENVMAP_TYPE_CUBE_UV"};function ym(i){return i.envMap===!1?"ENVMAP_TYPE_CUBE":vm[i.envMapMode]||"ENVMAP_TYPE_CUBE"}var Mm={[ri]:"ENVMAP_MODE_REFRACTION"};function bm(i){return i.envMap===!1?"ENVMAP_MODE_REFLECTION":Mm[i.envMapMode]||"ENVMAP_MODE_REFLECTION"}var Sm={[So]:"ENVMAP_BLENDING_MULTIPLY",[hc]:"ENVMAP_BLENDING_MIX",[uc]:"ENVMAP_BLENDING_ADD"};function Em(i){return i.envMap===!1?"ENVMAP_BLENDING_NONE":Sm[i.combine]||"ENVMAP_BLENDING_NONE"}function wm(i){let t=i.envMapCubeUVHeight;if(t===null)return null;let e=Math.log2(t)-2,n=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,e),112)),texelHeight:n,maxMip:e}}function Tm(i,t,e,n){let s=i.getContext(),r=e.defines,a=e.vertexShader,o=e.fragmentShader,c=_m(e),l=ym(e),u=bm(e),d=Em(e),h=wm(e),p=cm(e),g=hm(r),y=s.createProgram(),m,f,w=e.glslVersion?"#version "+e.glslVersion+`
`:"";e.isRawShaderMaterial?(m=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g].filter(Ls).join(`
`),m.length>0&&(m+=`
`),f=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g].filter(Ls).join(`
`),f.length>0&&(f+=`
`)):(m=[Xc(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g,e.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",e.batching?"#define USE_BATCHING":"",e.batchingColor?"#define USE_BATCHING_COLOR":"",e.instancing?"#define USE_INSTANCING":"",e.instancingColor?"#define USE_INSTANCING_COLOR":"",e.instancingMorph?"#define USE_INSTANCING_MORPH":"",e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+u:"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.displacementMap?"#define USE_DISPLACEMENTMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.mapUv?"#define MAP_UV "+e.mapUv:"",e.alphaMapUv?"#define ALPHAMAP_UV "+e.alphaMapUv:"",e.lightMapUv?"#define LIGHTMAP_UV "+e.lightMapUv:"",e.aoMapUv?"#define AOMAP_UV "+e.aoMapUv:"",e.emissiveMapUv?"#define EMISSIVEMAP_UV "+e.emissiveMapUv:"",e.bumpMapUv?"#define BUMPMAP_UV "+e.bumpMapUv:"",e.normalMapUv?"#define NORMALMAP_UV "+e.normalMapUv:"",e.displacementMapUv?"#define DISPLACEMENTMAP_UV "+e.displacementMapUv:"",e.metalnessMapUv?"#define METALNESSMAP_UV "+e.metalnessMapUv:"",e.roughnessMapUv?"#define ROUGHNESSMAP_UV "+e.roughnessMapUv:"",e.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+e.anisotropyMapUv:"",e.clearcoatMapUv?"#define CLEARCOATMAP_UV "+e.clearcoatMapUv:"",e.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+e.clearcoatNormalMapUv:"",e.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+e.clearcoatRoughnessMapUv:"",e.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+e.iridescenceMapUv:"",e.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+e.iridescenceThicknessMapUv:"",e.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+e.sheenColorMapUv:"",e.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+e.sheenRoughnessMapUv:"",e.specularMapUv?"#define SPECULARMAP_UV "+e.specularMapUv:"",e.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+e.specularColorMapUv:"",e.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+e.specularIntensityMapUv:"",e.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+e.transmissionMapUv:"",e.thicknessMapUv?"#define THICKNESSMAP_UV "+e.thicknessMapUv:"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexNormals?"#define HAS_NORMAL":"",e.vertexColors?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.flatShading?"#define FLAT_SHADED":"",e.skinning?"#define USE_SKINNING":"",e.morphTargets?"#define USE_MORPHTARGETS":"",e.morphNormals&&e.flatShading===!1?"#define USE_MORPHNORMALS":"",e.morphColors?"#define USE_MORPHCOLORS":"",e.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+e.morphTextureStride:"",e.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+e.morphTargetsCount:"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+c:"",e.sizeAttenuation?"#define USE_SIZEATTENUATION":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Ls).join(`
`),f=[Xc(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g,e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",e.map?"#define USE_MAP":"",e.matcap?"#define USE_MATCAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+l:"",e.envMap?"#define "+u:"",e.envMap?"#define "+d:"",h?"#define CUBEUV_TEXEL_WIDTH "+h.texelWidth:"",h?"#define CUBEUV_TEXEL_HEIGHT "+h.texelHeight:"",h?"#define CUBEUV_MAX_MIP "+h.maxMip+".0":"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoat?"#define USE_CLEARCOAT":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.dispersion?"#define USE_DISPERSION":"",e.iridescence?"#define USE_IRIDESCENCE":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaTest?"#define USE_ALPHATEST":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.sheen?"#define USE_SHEEN":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors||e.instancingColor?"#define USE_COLOR":"",e.vertexAlphas||e.batchingColor?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.gradientMap?"#define USE_GRADIENTMAP":"",e.flatShading?"#define FLAT_SHADED":"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+c:"",e.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",e.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",e.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",e.toneMapping!==nn?"#define TONE_MAPPING":"",e.toneMapping!==nn?Ft.tonemapping_pars_fragment:"",e.toneMapping!==nn?om("toneMapping",e.toneMapping):"",e.dithering?"#define DITHERING":"",e.opaque?"#define OPAQUE":"",Ft.colorspace_pars_fragment,rm("linearToOutputTexel",e.outputColorSpace),lm(),e.useDepthPacking?"#define DEPTH_PACKING "+e.depthPacking:"",`
`].filter(Ls).join(`
`)),a=nl(a),a=Gc(a,e),a=Hc(a,e),o=nl(o),o=Gc(o,e),o=Hc(o,e),a=Wc(a),o=Wc(o),e.isRawShaderMaterial!==!0&&(w=`#version 300 es
`,m=[p,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,f=["#define varying in",e.glslVersion===zo?"":"layout(location = 0) out highp vec4 pc_fragColor;",e.glslVersion===zo?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+f);let A=w+m+a,M=w+f+o,T=zc(s,s.VERTEX_SHADER,A),b=zc(s,s.FRAGMENT_SHADER,M);s.attachShader(y,T),s.attachShader(y,b),e.index0AttributeName!==void 0?s.bindAttribLocation(y,0,e.index0AttributeName):e.hasPositionAttribute===!0&&s.bindAttribLocation(y,0,"position"),s.linkProgram(y);function C(I){if(i.debug.checkShaderErrors){let D=s.getProgramInfoLog(y)||"",W=s.getShaderInfoLog(T)||"",X=s.getShaderInfoLog(b)||"",R=D.trim(),B=W.trim(),H=X.trim(),$=!0,j=!0;if(s.getProgramParameter(y,s.LINK_STATUS)===!1)if($=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(s,y,T,b);else{let nt=kc(s,T,"vertex"),ct=kc(s,b,"fragment");Ct("WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(y,s.VALIDATE_STATUS)+`

Material Name: `+I.name+`
Material Type: `+I.type+`

Program Info Log: `+R+`
`+nt+`
`+ct)}else R!==""?wt("WebGLProgram: Program Info Log:",R):(B===""||H==="")&&(j=!1);j&&(I.diagnostics={runnable:$,programLog:R,vertexShader:{log:B,prefix:m},fragmentShader:{log:H,prefix:f}})}s.deleteShader(T),s.deleteShader(b),_=new Wi(s,y),E=um(s,y)}let _;this.getUniforms=function(){return _===void 0&&C(this),_};let E;this.getAttributes=function(){return E===void 0&&C(this),E};let P=e.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return P===!1&&(P=s.getProgramParameter(y,em)),P},this.destroy=function(){n.releaseStatesOfProgram(this),s.deleteProgram(y),this.program=void 0},this.type=e.shaderType,this.name=e.shaderName,this.id=nm++,this.cacheKey=t,this.usedTimes=1,this.program=y,this.vertexShader=T,this.fragmentShader=b,this}var Am=0,il=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t,e,n){let s=this._getShaderCacheForMaterial(t);return s.has(e)===!1&&(s.add(e),e.usedTimes++),s.has(n)===!1&&(s.add(n),n.usedTimes++),this}remove(t){let e=this.materialCache.get(t);for(let n of e)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(t),this}getVertexShaderStage(t){return this._getShaderStage(t.vertexShader)}getFragmentShaderStage(t){return this._getShaderStage(t.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){let e=this.materialCache,n=e.get(t);return n===void 0&&(n=new Set,e.set(t,n)),n}_getShaderStage(t){let e=this.shaderCache,n=e.get(t);return n===void 0&&(n=new sl(t),e.set(t,n)),n}},sl=class{constructor(t){this.id=Am++,this.code=t,this.usedTimes=0}};function Cm(i){return i===qn||i===Cs||i===Rs}function Rm(i,t,e,n,s,r){let a=new Pi,o=new il,c=new Set,l=[],u=new Map,d=n.logarithmicDepthBuffer,h=n.precision,p={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function g(_){return c.add(_),_===0?"uv":`uv${_}`}function y(_,E,P,I,D,W){let X=I.fog,R=D.geometry,B=_.isMeshStandardMaterial||_.isMeshLambertMaterial||_.isMeshPhongMaterial?I.environment:null,H=_.isMeshStandardMaterial||_.isMeshLambertMaterial&&!_.envMap||_.isMeshPhongMaterial&&!_.envMap,$=t.get(_.envMap||B,H),j=$&&$.mapping===bs?$.image.height:null,nt=p[_.type];_.precision!==null&&(h=n.getMaxPrecision(_.precision),h!==_.precision&&wt("WebGLProgram.getParameters:",_.precision,"not supported, using",h,"instead."));let ct=R.morphAttributes.position||R.morphAttributes.normal||R.morphAttributes.color,dt=ct!==void 0?ct.length:0,zt=0;R.morphAttributes.position!==void 0&&(zt=1),R.morphAttributes.normal!==void 0&&(zt=2),R.morphAttributes.color!==void 0&&(zt=3);let $t,Ot,Y,et;if(nt){let _t=gn[nt];$t=_t.vertexShader,Ot=_t.fragmentShader}else{$t=_.vertexShader,Ot=_.fragmentShader;let _t=o.getVertexShaderStage(_),ae=o.getFragmentShaderStage(_);o.update(_,_t,ae),Y=_t.id,et=ae.id}let tt=i.getRenderTarget(),Rt=i.state.buffers.depth.getReversed(),Lt=D.isInstancedMesh===!0,Tt=D.isBatchedMesh===!0,le=!!_.map,Vt=!!_.matcap,Jt=!!$,Xt=!!_.aoMap,Ht=!!_.lightMap,de=!!_.bumpMap&&_.wireframe===!1,ge=!!_.normalMap,ve=!!_.displacementMap,be=!!_.emissiveMap,re=!!_.metalnessMap,fe=!!_.roughnessMap,U=_.anisotropy>0,Le=_.clearcoat>0,Yt=_.dispersion>0,S=_.iridescence>0,x=_.sheen>0,O=_.transmission>0,k=U&&!!_.anisotropyMap,q=Le&&!!_.clearcoatMap,it=Le&&!!_.clearcoatNormalMap,rt=Le&&!!_.clearcoatRoughnessMap,Z=S&&!!_.iridescenceMap,K=S&&!!_.iridescenceThicknessMap,at=x&&!!_.sheenColorMap,Mt=x&&!!_.sheenRoughnessMap,ht=!!_.specularMap,ot=!!_.specularColorMap,Et=!!_.specularIntensityMap,At=O&&!!_.transmissionMap,Dt=O&&!!_.thicknessMap,L=!!_.gradientMap,st=!!_.alphaMap,J=_.alphaTest>0,lt=!!_.alphaHash,mt=!!_.extensions,Q=nn;_.toneMapped&&(tt===null||tt.isXRRenderTarget===!0)&&(Q=i.toneMapping);let yt={shaderID:nt,shaderType:_.type,shaderName:_.name,vertexShader:$t,fragmentShader:Ot,defines:_.defines,customVertexShaderID:Y,customFragmentShaderID:et,isRawShaderMaterial:_.isRawShaderMaterial===!0,glslVersion:_.glslVersion,precision:h,batching:Tt,batchingColor:Tt&&D._colorsTexture!==null,instancing:Lt,instancingColor:Lt&&D.instanceColor!==null,instancingMorph:Lt&&D.morphTexture!==null,outputColorSpace:tt===null?i.outputColorSpace:tt.isXRRenderTarget===!0?tt.texture.colorSpace:kt.workingColorSpace,alphaToCoverage:!!_.alphaToCoverage,map:le,matcap:Vt,envMap:Jt,envMapMode:Jt&&$.mapping,envMapCubeUVHeight:j,aoMap:Xt,lightMap:Ht,bumpMap:de,normalMap:ge,displacementMap:ve,emissiveMap:be,normalMapObjectSpace:ge&&_.normalMapType===pc,normalMapTangentSpace:ge&&_.normalMapType===ba,packedNormalMap:ge&&_.normalMapType===ba&&Cm(_.normalMap.format),metalnessMap:re,roughnessMap:fe,anisotropy:U,anisotropyMap:k,clearcoat:Le,clearcoatMap:q,clearcoatNormalMap:it,clearcoatRoughnessMap:rt,dispersion:Yt,iridescence:S,iridescenceMap:Z,iridescenceThicknessMap:K,sheen:x,sheenColorMap:at,sheenRoughnessMap:Mt,specularMap:ht,specularColorMap:ot,specularIntensityMap:Et,transmission:O,transmissionMap:At,thicknessMap:Dt,gradientMap:L,opaque:_.transparent===!1&&_.blending===ni&&_.alphaToCoverage===!1,alphaMap:st,alphaTest:J,alphaHash:lt,combine:_.combine,mapUv:le&&g(_.map.channel),aoMapUv:Xt&&g(_.aoMap.channel),lightMapUv:Ht&&g(_.lightMap.channel),bumpMapUv:de&&g(_.bumpMap.channel),normalMapUv:ge&&g(_.normalMap.channel),displacementMapUv:ve&&g(_.displacementMap.channel),emissiveMapUv:be&&g(_.emissiveMap.channel),metalnessMapUv:re&&g(_.metalnessMap.channel),roughnessMapUv:fe&&g(_.roughnessMap.channel),anisotropyMapUv:k&&g(_.anisotropyMap.channel),clearcoatMapUv:q&&g(_.clearcoatMap.channel),clearcoatNormalMapUv:it&&g(_.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:rt&&g(_.clearcoatRoughnessMap.channel),iridescenceMapUv:Z&&g(_.iridescenceMap.channel),iridescenceThicknessMapUv:K&&g(_.iridescenceThicknessMap.channel),sheenColorMapUv:at&&g(_.sheenColorMap.channel),sheenRoughnessMapUv:Mt&&g(_.sheenRoughnessMap.channel),specularMapUv:ht&&g(_.specularMap.channel),specularColorMapUv:ot&&g(_.specularColorMap.channel),specularIntensityMapUv:Et&&g(_.specularIntensityMap.channel),transmissionMapUv:At&&g(_.transmissionMap.channel),thicknessMapUv:Dt&&g(_.thicknessMap.channel),alphaMapUv:st&&g(_.alphaMap.channel),vertexTangents:!!R.attributes.tangent&&(ge||U),vertexNormals:!!R.attributes.normal,vertexColors:_.vertexColors,vertexAlphas:_.vertexColors===!0&&!!R.attributes.color&&R.attributes.color.itemSize===4,pointsUvs:D.isPoints===!0&&!!R.attributes.uv&&(le||st),fog:!!X,useFog:_.fog===!0,fogExp2:!!X&&X.isFogExp2,flatShading:_.wireframe===!1&&(_.flatShading===!0||R.attributes.normal===void 0&&ge===!1&&(_.isMeshLambertMaterial||_.isMeshPhongMaterial||_.isMeshStandardMaterial||_.isMeshPhysicalMaterial)),sizeAttenuation:_.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:Rt,skinning:D.isSkinnedMesh===!0,hasPositionAttribute:R.attributes.position!==void 0,morphTargets:R.morphAttributes.position!==void 0,morphNormals:R.morphAttributes.normal!==void 0,morphColors:R.morphAttributes.color!==void 0,morphTargetsCount:dt,morphTextureStride:zt,numDirLights:E.directional.length,numPointLights:E.point.length,numSpotLights:E.spot.length,numSpotLightMaps:E.spotLightMap.length,numRectAreaLights:E.rectArea.length,numHemiLights:E.hemi.length,numDirLightShadows:E.directionalShadowMap.length,numPointLightShadows:E.pointShadowMap.length,numSpotLightShadows:E.spotShadowMap.length,numSpotLightShadowsWithMaps:E.numSpotLightShadowsWithMaps,numLightProbes:E.numLightProbes,numLightProbeGrids:W.length,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:_.dithering,shadowMapEnabled:i.shadowMap.enabled&&P.length>0,shadowMapType:i.shadowMap.type,toneMapping:Q,decodeVideoTexture:le&&_.map.isVideoTexture===!0&&kt.getTransfer(_.map.colorSpace)===qt,decodeVideoTextureEmissive:be&&_.emissiveMap.isVideoTexture===!0&&kt.getTransfer(_.emissiveMap.colorSpace)===qt,premultipliedAlpha:_.premultipliedAlpha,doubleSided:_.side===Ze,flipSided:_.side===Ee,useDepthPacking:_.depthPacking>=0,depthPacking:_.depthPacking||0,index0AttributeName:_.index0AttributeName,extensionClipCullDistance:mt&&_.extensions.clipCullDistance===!0&&e.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(mt&&_.extensions.multiDraw===!0||Tt)&&e.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:e.has("KHR_parallel_shader_compile"),customProgramCacheKey:_.customProgramCacheKey()};return yt.vertexUv1s=c.has(1),yt.vertexUv2s=c.has(2),yt.vertexUv3s=c.has(3),c.clear(),yt}function m(_){let E=[];if(_.shaderID?E.push(_.shaderID):(E.push(_.customVertexShaderID),E.push(_.customFragmentShaderID)),_.defines!==void 0)for(let P in _.defines)E.push(P),E.push(_.defines[P]);return _.isRawShaderMaterial===!1&&(f(E,_),w(E,_),E.push(i.outputColorSpace)),E.push(_.customProgramCacheKey),E.join()}function f(_,E){_.push(E.precision),_.push(E.outputColorSpace),_.push(E.envMapMode),_.push(E.envMapCubeUVHeight),_.push(E.mapUv),_.push(E.alphaMapUv),_.push(E.lightMapUv),_.push(E.aoMapUv),_.push(E.bumpMapUv),_.push(E.normalMapUv),_.push(E.displacementMapUv),_.push(E.emissiveMapUv),_.push(E.metalnessMapUv),_.push(E.roughnessMapUv),_.push(E.anisotropyMapUv),_.push(E.clearcoatMapUv),_.push(E.clearcoatNormalMapUv),_.push(E.clearcoatRoughnessMapUv),_.push(E.iridescenceMapUv),_.push(E.iridescenceThicknessMapUv),_.push(E.sheenColorMapUv),_.push(E.sheenRoughnessMapUv),_.push(E.specularMapUv),_.push(E.specularColorMapUv),_.push(E.specularIntensityMapUv),_.push(E.transmissionMapUv),_.push(E.thicknessMapUv),_.push(E.combine),_.push(E.fogExp2),_.push(E.sizeAttenuation),_.push(E.morphTargetsCount),_.push(E.morphAttributeCount),_.push(E.numDirLights),_.push(E.numPointLights),_.push(E.numSpotLights),_.push(E.numSpotLightMaps),_.push(E.numHemiLights),_.push(E.numRectAreaLights),_.push(E.numDirLightShadows),_.push(E.numPointLightShadows),_.push(E.numSpotLightShadows),_.push(E.numSpotLightShadowsWithMaps),_.push(E.numLightProbes),_.push(E.shadowMapType),_.push(E.toneMapping),_.push(E.numClippingPlanes),_.push(E.numClipIntersection),_.push(E.depthPacking)}function w(_,E){a.disableAll(),E.instancing&&a.enable(0),E.instancingColor&&a.enable(1),E.instancingMorph&&a.enable(2),E.matcap&&a.enable(3),E.envMap&&a.enable(4),E.normalMapObjectSpace&&a.enable(5),E.normalMapTangentSpace&&a.enable(6),E.clearcoat&&a.enable(7),E.iridescence&&a.enable(8),E.alphaTest&&a.enable(9),E.vertexColors&&a.enable(10),E.vertexAlphas&&a.enable(11),E.vertexUv1s&&a.enable(12),E.vertexUv2s&&a.enable(13),E.vertexUv3s&&a.enable(14),E.vertexTangents&&a.enable(15),E.anisotropy&&a.enable(16),E.alphaHash&&a.enable(17),E.batching&&a.enable(18),E.dispersion&&a.enable(19),E.batchingColor&&a.enable(20),E.gradientMap&&a.enable(21),E.packedNormalMap&&a.enable(22),E.vertexNormals&&a.enable(23),_.push(a.mask),a.disableAll(),E.fog&&a.enable(0),E.useFog&&a.enable(1),E.flatShading&&a.enable(2),E.logarithmicDepthBuffer&&a.enable(3),E.reversedDepthBuffer&&a.enable(4),E.skinning&&a.enable(5),E.morphTargets&&a.enable(6),E.morphNormals&&a.enable(7),E.morphColors&&a.enable(8),E.premultipliedAlpha&&a.enable(9),E.shadowMapEnabled&&a.enable(10),E.doubleSided&&a.enable(11),E.flipSided&&a.enable(12),E.useDepthPacking&&a.enable(13),E.dithering&&a.enable(14),E.transmission&&a.enable(15),E.sheen&&a.enable(16),E.opaque&&a.enable(17),E.pointsUvs&&a.enable(18),E.decodeVideoTexture&&a.enable(19),E.decodeVideoTextureEmissive&&a.enable(20),E.alphaToCoverage&&a.enable(21),E.numLightProbeGrids>0&&a.enable(22),E.hasPositionAttribute&&a.enable(23),_.push(a.mask)}function A(_){let E=p[_.type],P;if(E){let I=gn[E];P=Tc.clone(I.uniforms)}else P=_.uniforms;return P}function M(_,E){let P=u.get(E);return P!==void 0?++P.usedTimes:(P=new Tm(i,E,_,s),l.push(P),u.set(E,P)),P}function T(_){if(--_.usedTimes===0){let E=l.indexOf(_);l[E]=l[l.length-1],l.pop(),u.delete(_.cacheKey),_.destroy()}}function b(_){o.remove(_)}function C(){o.dispose()}return{getParameters:y,getProgramCacheKey:m,getUniforms:A,acquireProgram:M,releaseProgram:T,releaseShaderCache:b,programs:l,dispose:C}}function Im(){let i=new WeakMap;function t(a){return i.has(a)}function e(a){let o=i.get(a);return o===void 0&&(o={},i.set(a,o)),o}function n(a){i.delete(a)}function s(a,o,c){i.get(a)[o]=c}function r(){i=new WeakMap}return{has:t,get:e,remove:n,update:s,dispose:r}}function Pm(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.material.id!==t.material.id?i.material.id-t.material.id:i.materialVariant!==t.materialVariant?i.materialVariant-t.materialVariant:i.z!==t.z?i.z-t.z:i.id-t.id}function qc(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.z!==t.z?t.z-i.z:i.id-t.id}function Yc(){let i=[],t=0,e=[],n=[],s=[];function r(){t=0,e.length=0,n.length=0,s.length=0}function a(h){let p=0;return h.isInstancedMesh&&(p+=2),h.isSkinnedMesh&&(p+=1),p}function o(h,p,g,y,m,f){let w=i[t];return w===void 0?(w={id:h.id,object:h,geometry:p,material:g,materialVariant:a(h),groupOrder:y,renderOrder:h.renderOrder,z:m,group:f},i[t]=w):(w.id=h.id,w.object=h,w.geometry=p,w.material=g,w.materialVariant=a(h),w.groupOrder=y,w.renderOrder=h.renderOrder,w.z=m,w.group=f),t++,w}function c(h,p,g,y,m,f){let w=o(h,p,g,y,m,f);g.transmission>0?n.push(w):g.transparent===!0?s.push(w):e.push(w)}function l(h,p,g,y,m,f){let w=o(h,p,g,y,m,f);g.transmission>0?n.unshift(w):g.transparent===!0?s.unshift(w):e.unshift(w)}function u(h,p,g){e.length>1&&e.sort(h||Pm),n.length>1&&n.sort(p||qc),s.length>1&&s.sort(p||qc),g&&(e.reverse(),n.reverse(),s.reverse())}function d(){for(let h=t,p=i.length;h<p;h++){let g=i[h];if(g.id===null)break;g.id=null,g.object=null,g.geometry=null,g.material=null,g.group=null}}return{opaque:e,transmissive:n,transparent:s,init:r,push:c,unshift:l,finish:d,sort:u}}function Lm(){let i=new WeakMap;function t(n,s){let r=i.get(n),a;return r===void 0?(a=new Yc,i.set(n,[a])):s>=r.length?(a=new Yc,r.push(a)):a=r[s],a}function e(){i=new WeakMap}return{get:t,dispose:e}}function Dm(){let i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"DirectionalLight":e={direction:new N,color:new Pt};break;case"SpotLight":e={position:new N,direction:new N,color:new Pt,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":e={position:new N,color:new Pt,distance:0,decay:0};break;case"HemisphereLight":e={direction:new N,skyColor:new Pt,groundColor:new Pt};break;case"RectAreaLight":e={color:new Pt,position:new N,halfWidth:new N,halfHeight:new N};break}return i[t.id]=e,e}}}function Nm(){let i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"DirectionalLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ut};break;case"SpotLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ut};break;case"PointLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ut,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[t.id]=e,e}}}var Um=0;function Fm(i,t){return(t.castShadow?2:0)-(i.castShadow?2:0)+(t.map?1:0)-(i.map?1:0)}function Om(i){let t=new Dm,e=Nm(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let l=0;l<9;l++)n.probe.push(new N);let s=new N,r=new ie,a=new ie;function o(l){let u=0,d=0,h=0;for(let E=0;E<9;E++)n.probe[E].set(0,0,0);let p=0,g=0,y=0,m=0,f=0,w=0,A=0,M=0,T=0,b=0,C=0;l.sort(Fm);for(let E=0,P=l.length;E<P;E++){let I=l[E],D=I.color,W=I.intensity,X=I.distance,R=null;if(I.shadow&&I.shadow.map&&(I.shadow.map.texture.format===qn?R=I.shadow.map.texture:R=I.shadow.map.depthTexture||I.shadow.map.texture),I.isAmbientLight)u+=D.r*W,d+=D.g*W,h+=D.b*W;else if(I.isLightProbe){for(let B=0;B<9;B++)n.probe[B].addScaledVector(I.sh.coefficients[B],W);C++}else if(I.isDirectionalLight){let B=t.get(I);if(B.color.copy(I.color).multiplyScalar(I.intensity),I.castShadow){let H=I.shadow,$=e.get(I);$.shadowIntensity=H.intensity,$.shadowBias=H.bias,$.shadowNormalBias=H.normalBias,$.shadowRadius=H.radius,$.shadowMapSize=H.mapSize,n.directionalShadow[p]=$,n.directionalShadowMap[p]=R,n.directionalShadowMatrix[p]=I.shadow.matrix,w++}n.directional[p]=B,p++}else if(I.isSpotLight){let B=t.get(I);B.position.setFromMatrixPosition(I.matrixWorld),B.color.copy(D).multiplyScalar(W),B.distance=X,B.coneCos=Math.cos(I.angle),B.penumbraCos=Math.cos(I.angle*(1-I.penumbra)),B.decay=I.decay,n.spot[y]=B;let H=I.shadow;if(I.map&&(n.spotLightMap[T]=I.map,T++,H.updateMatrices(I),I.castShadow&&b++),n.spotLightMatrix[y]=H.matrix,I.castShadow){let $=e.get(I);$.shadowIntensity=H.intensity,$.shadowBias=H.bias,$.shadowNormalBias=H.normalBias,$.shadowRadius=H.radius,$.shadowMapSize=H.mapSize,n.spotShadow[y]=$,n.spotShadowMap[y]=R,M++}y++}else if(I.isRectAreaLight){let B=t.get(I);B.color.copy(D).multiplyScalar(W),B.halfWidth.set(I.width*.5,0,0),B.halfHeight.set(0,I.height*.5,0),n.rectArea[m]=B,m++}else if(I.isPointLight){let B=t.get(I);if(B.color.copy(I.color).multiplyScalar(I.intensity),B.distance=I.distance,B.decay=I.decay,I.castShadow){let H=I.shadow,$=e.get(I);$.shadowIntensity=H.intensity,$.shadowBias=H.bias,$.shadowNormalBias=H.normalBias,$.shadowRadius=H.radius,$.shadowMapSize=H.mapSize,$.shadowCameraNear=H.camera.near,$.shadowCameraFar=H.camera.far,n.pointShadow[g]=$,n.pointShadowMap[g]=R,n.pointShadowMatrix[g]=I.shadow.matrix,A++}n.point[g]=B,g++}else if(I.isHemisphereLight){let B=t.get(I);B.skyColor.copy(I.color).multiplyScalar(W),B.groundColor.copy(I.groundColor).multiplyScalar(W),n.hemi[f]=B,f++}}m>0&&(i.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=ut.LTC_FLOAT_1,n.rectAreaLTC2=ut.LTC_FLOAT_2):(n.rectAreaLTC1=ut.LTC_HALF_1,n.rectAreaLTC2=ut.LTC_HALF_2)),n.ambient[0]=u,n.ambient[1]=d,n.ambient[2]=h;let _=n.hash;(_.directionalLength!==p||_.pointLength!==g||_.spotLength!==y||_.rectAreaLength!==m||_.hemiLength!==f||_.numDirectionalShadows!==w||_.numPointShadows!==A||_.numSpotShadows!==M||_.numSpotMaps!==T||_.numLightProbes!==C)&&(n.directional.length=p,n.spot.length=y,n.rectArea.length=m,n.point.length=g,n.hemi.length=f,n.directionalShadow.length=w,n.directionalShadowMap.length=w,n.pointShadow.length=A,n.pointShadowMap.length=A,n.spotShadow.length=M,n.spotShadowMap.length=M,n.directionalShadowMatrix.length=w,n.pointShadowMatrix.length=A,n.spotLightMatrix.length=M+T-b,n.spotLightMap.length=T,n.numSpotLightShadowsWithMaps=b,n.numLightProbes=C,_.directionalLength=p,_.pointLength=g,_.spotLength=y,_.rectAreaLength=m,_.hemiLength=f,_.numDirectionalShadows=w,_.numPointShadows=A,_.numSpotShadows=M,_.numSpotMaps=T,_.numLightProbes=C,n.version=Um++)}function c(l,u){let d=0,h=0,p=0,g=0,y=0,m=u.matrixWorldInverse;for(let f=0,w=l.length;f<w;f++){let A=l[f];if(A.isDirectionalLight){let M=n.directional[d];M.direction.setFromMatrixPosition(A.matrixWorld),s.setFromMatrixPosition(A.target.matrixWorld),M.direction.sub(s),M.direction.transformDirection(m),d++}else if(A.isSpotLight){let M=n.spot[p];M.position.setFromMatrixPosition(A.matrixWorld),M.position.applyMatrix4(m),M.direction.setFromMatrixPosition(A.matrixWorld),s.setFromMatrixPosition(A.target.matrixWorld),M.direction.sub(s),M.direction.transformDirection(m),p++}else if(A.isRectAreaLight){let M=n.rectArea[g];M.position.setFromMatrixPosition(A.matrixWorld),M.position.applyMatrix4(m),a.identity(),r.copy(A.matrixWorld),r.premultiply(m),a.extractRotation(r),M.halfWidth.set(A.width*.5,0,0),M.halfHeight.set(0,A.height*.5,0),M.halfWidth.applyMatrix4(a),M.halfHeight.applyMatrix4(a),g++}else if(A.isPointLight){let M=n.point[h];M.position.setFromMatrixPosition(A.matrixWorld),M.position.applyMatrix4(m),h++}else if(A.isHemisphereLight){let M=n.hemi[y];M.direction.setFromMatrixPosition(A.matrixWorld),M.direction.transformDirection(m),y++}}}return{setup:o,setupView:c,state:n}}function Zc(i){let t=new Om(i),e=[],n=[],s=[];function r(h){d.camera=h,e.length=0,n.length=0,s.length=0}function a(h){e.push(h)}function o(h){n.push(h)}function c(h){s.push(h)}function l(){t.setup(e)}function u(h){t.setupView(e,h)}let d={lightsArray:e,shadowsArray:n,lightProbeGridArray:s,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:r,state:d,setupLights:l,setupLightsView:u,pushLight:a,pushShadow:o,pushLightProbeGrid:c}}function Bm(i){let t=new WeakMap;function e(s,r=0){let a=t.get(s),o;return a===void 0?(o=new Zc(i),t.set(s,[o])):r>=a.length?(o=new Zc(i),a.push(o)):o=a[r],o}function n(){t=new WeakMap}return{get:e,dispose:n}}var zm=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,Vm=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,km=[new N(1,0,0),new N(-1,0,0),new N(0,1,0),new N(0,-1,0),new N(0,0,1),new N(0,0,-1)],Gm=[new N(0,-1,0),new N(0,-1,0),new N(0,0,1),new N(0,0,-1),new N(0,-1,0),new N(0,-1,0)],$c=new ie,Ps=new N,Ko=new N;function Hm(i,t,e){let n=new Ni,s=new Ut,r=new Ut,a=new se,o=new Sr,c=new Er,l={},u=e.maxTextureSize,d={[Sn]:Ee,[Ee]:Sn,[Ze]:Ze},h=new Ge({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Ut},radius:{value:4}},vertexShader:zm,fragmentShader:Vm}),p=h.clone();p.defines.HORIZONTAL_PASS=1;let g=new ke;g.setAttribute("position",new ze(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let y=new me(g,h),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Ms;let f=this.type;this.render=function(b,C,_){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||b.length===0)return;this.type===Xl&&(wt("WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead."),this.type=Ms);let E=i.getRenderTarget(),P=i.getActiveCubeFace(),I=i.getActiveMipmapLevel(),D=i.state;D.setBlending(fn),D.buffers.depth.getReversed()===!0?D.buffers.color.setClear(0,0,0,0):D.buffers.color.setClear(1,1,1,1),D.buffers.depth.setTest(!0),D.setScissorTest(!1);let W=f!==this.type;W&&C.traverse(function(X){X.material&&(Array.isArray(X.material)?X.material.forEach(R=>R.needsUpdate=!0):X.material.needsUpdate=!0)});for(let X=0,R=b.length;X<R;X++){let B=b[X],H=B.shadow;if(H===void 0){wt("WebGLShadowMap:",B,"has no shadow.");continue}if(H.autoUpdate===!1&&H.needsUpdate===!1)continue;s.copy(H.mapSize);let $=H.getFrameExtents();s.multiply($),r.copy(H.mapSize),(s.x>u||s.y>u)&&(s.x>u&&(r.x=Math.floor(u/$.x),s.x=r.x*$.x,H.mapSize.x=r.x),s.y>u&&(r.y=Math.floor(u/$.y),s.y=r.y*$.y,H.mapSize.y=r.y));let j=i.state.buffers.depth.getReversed();if(H.camera._reversedDepth=j,H.map===null||W===!0){if(H.map!==null&&(H.map.depthTexture!==null&&(H.map.depthTexture.dispose(),H.map.depthTexture=null),H.map.dispose()),this.type===zi){if(B.isPointLight){wt("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}H.map=new Ve(s.x,s.y,{format:qn,type:pn,minFilter:Se,magFilter:Se,generateMipmaps:!1}),H.map.texture.name=B.name+".shadowMap",H.map.depthTexture=new wn(s.x,s.y,rn),H.map.depthTexture.name=B.name+".shadowMapDepth",H.map.depthTexture.format=un,H.map.depthTexture.compareFunction=null,H.map.depthTexture.minFilter=Me,H.map.depthTexture.magFilter=Me}else B.isPointLight?(H.map=new Ca(s.x),H.map.depthTexture=new Mr(s.x,sn)):(H.map=new Ve(s.x,s.y),H.map.depthTexture=new wn(s.x,s.y,sn)),H.map.depthTexture.name=B.name+".shadowMap",H.map.depthTexture.format=un,this.type===Ms?(H.map.depthTexture.compareFunction=j?Ea:Sa,H.map.depthTexture.minFilter=Se,H.map.depthTexture.magFilter=Se):(H.map.depthTexture.compareFunction=null,H.map.depthTexture.minFilter=Me,H.map.depthTexture.magFilter=Me);H.camera.updateProjectionMatrix()}let nt=H.map.isWebGLCubeRenderTarget?6:1;for(let ct=0;ct<nt;ct++){if(H.map.isWebGLCubeRenderTarget)i.setRenderTarget(H.map,ct),i.clear();else{ct===0&&(i.setRenderTarget(H.map),i.clear());let dt=H.getViewport(ct);a.set(r.x*dt.x,r.y*dt.y,r.x*dt.z,r.y*dt.w),D.viewport(a)}if(B.isPointLight){let dt=H.camera,zt=H.matrix,$t=B.distance||dt.far;$t!==dt.far&&(dt.far=$t,dt.updateProjectionMatrix()),Ps.setFromMatrixPosition(B.matrixWorld),dt.position.copy(Ps),Ko.copy(dt.position),Ko.add(km[ct]),dt.up.copy(Gm[ct]),dt.lookAt(Ko),dt.updateMatrixWorld(),zt.makeTranslation(-Ps.x,-Ps.y,-Ps.z),$c.multiplyMatrices(dt.projectionMatrix,dt.matrixWorldInverse),H._frustum.setFromProjectionMatrix($c,dt.coordinateSystem,dt.reversedDepth)}else H.updateMatrices(B);n=H.getFrustum(),M(C,_,H.camera,B,this.type)}H.isPointLightShadow!==!0&&this.type===zi&&w(H,_),H.needsUpdate=!1}f=this.type,m.needsUpdate=!1,i.setRenderTarget(E,P,I)};function w(b,C){let _=t.update(y);h.defines.VSM_SAMPLES!==b.blurSamples&&(h.defines.VSM_SAMPLES=b.blurSamples,p.defines.VSM_SAMPLES=b.blurSamples,h.needsUpdate=!0,p.needsUpdate=!0),b.mapPass===null&&(b.mapPass=new Ve(s.x,s.y,{format:qn,type:pn})),h.uniforms.shadow_pass.value=b.map.depthTexture,h.uniforms.resolution.value=b.mapSize,h.uniforms.radius.value=b.radius,i.setRenderTarget(b.mapPass),i.clear(),i.renderBufferDirect(C,null,_,h,y,null),p.uniforms.shadow_pass.value=b.mapPass.texture,p.uniforms.resolution.value=b.mapSize,p.uniforms.radius.value=b.radius,i.setRenderTarget(b.map),i.clear(),i.renderBufferDirect(C,null,_,p,y,null)}function A(b,C,_,E){let P=null,I=_.isPointLight===!0?b.customDistanceMaterial:b.customDepthMaterial;if(I!==void 0)P=I;else if(P=_.isPointLight===!0?c:o,i.localClippingEnabled&&C.clipShadows===!0&&Array.isArray(C.clippingPlanes)&&C.clippingPlanes.length!==0||C.displacementMap&&C.displacementScale!==0||C.alphaMap&&C.alphaTest>0||C.map&&C.alphaTest>0||C.alphaToCoverage===!0){let D=P.uuid,W=C.uuid,X=l[D];X===void 0&&(X={},l[D]=X);let R=X[W];R===void 0&&(R=P.clone(),X[W]=R,C.addEventListener("dispose",T)),P=R}if(P.visible=C.visible,P.wireframe=C.wireframe,E===zi?P.side=C.shadowSide!==null?C.shadowSide:C.side:P.side=C.shadowSide!==null?C.shadowSide:d[C.side],P.alphaMap=C.alphaMap,P.alphaTest=C.alphaToCoverage===!0?.5:C.alphaTest,P.map=C.map,P.clipShadows=C.clipShadows,P.clippingPlanes=C.clippingPlanes,P.clipIntersection=C.clipIntersection,P.displacementMap=C.displacementMap,P.displacementScale=C.displacementScale,P.displacementBias=C.displacementBias,P.wireframeLinewidth=C.wireframeLinewidth,P.linewidth=C.linewidth,_.isPointLight===!0&&P.isMeshDistanceMaterial===!0){let D=i.properties.get(P);D.light=_}return P}function M(b,C,_,E,P){if(b.visible===!1)return;if(b.layers.test(C.layers)&&(b.isMesh||b.isLine||b.isPoints)&&(b.castShadow||b.receiveShadow&&P===zi)&&(!b.frustumCulled||n.intersectsObject(b))){b.modelViewMatrix.multiplyMatrices(_.matrixWorldInverse,b.matrixWorld);let W=t.update(b),X=b.material;if(Array.isArray(X)){let R=W.groups;for(let B=0,H=R.length;B<H;B++){let $=R[B],j=X[$.materialIndex];if(j&&j.visible){let nt=A(b,j,E,P);b.onBeforeShadow(i,b,C,_,W,nt,$),i.renderBufferDirect(_,null,W,nt,b,$),b.onAfterShadow(i,b,C,_,W,nt,$)}}}else if(X.visible){let R=A(b,X,E,P);b.onBeforeShadow(i,b,C,_,W,R,null),i.renderBufferDirect(_,null,W,R,b,null),b.onAfterShadow(i,b,C,_,W,R,null)}}let D=b.children;for(let W=0,X=D.length;W<X;W++)M(D[W],C,_,E,P)}function T(b){b.target.removeEventListener("dispose",T);for(let _ in l){let E=l[_],P=b.target.uuid;P in E&&(E[P].dispose(),delete E[P])}}}function Wm(i,t){function e(){let L=!1,st=new se,J=null,lt=new se(0,0,0,0);return{setMask:function(mt){J!==mt&&!L&&(i.colorMask(mt,mt,mt,mt),J=mt)},setLocked:function(mt){L=mt},setClear:function(mt,Q,yt,_t,ae){ae===!0&&(mt*=_t,Q*=_t,yt*=_t),st.set(mt,Q,yt,_t),lt.equals(st)===!1&&(i.clearColor(mt,Q,yt,_t),lt.copy(st))},reset:function(){L=!1,J=null,lt.set(-1,0,0,0)}}}function n(){let L=!1,st=!1,J=null,lt=null,mt=null;return{setReversed:function(Q){if(st!==Q){let yt=t.get("EXT_clip_control");Q?yt.clipControlEXT(yt.LOWER_LEFT_EXT,yt.ZERO_TO_ONE_EXT):yt.clipControlEXT(yt.LOWER_LEFT_EXT,yt.NEGATIVE_ONE_TO_ONE_EXT),st=Q;let _t=mt;mt=null,this.setClear(_t)}},getReversed:function(){return st},setTest:function(Q){Q?tt(i.DEPTH_TEST):Rt(i.DEPTH_TEST)},setMask:function(Q){J!==Q&&!L&&(i.depthMask(Q),J=Q)},setFunc:function(Q){if(st&&(Q=Ec[Q]),lt!==Q){switch(Q){case or:i.depthFunc(i.NEVER);break;case lr:i.depthFunc(i.ALWAYS);break;case cr:i.depthFunc(i.LESS);break;case ii:i.depthFunc(i.LEQUAL);break;case hr:i.depthFunc(i.EQUAL);break;case ur:i.depthFunc(i.GEQUAL);break;case dr:i.depthFunc(i.GREATER);break;case fr:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}lt=Q}},setLocked:function(Q){L=Q},setClear:function(Q){mt!==Q&&(mt=Q,st&&(Q=1-Q),i.clearDepth(Q))},reset:function(){L=!1,J=null,lt=null,mt=null,st=!1}}}function s(){let L=!1,st=null,J=null,lt=null,mt=null,Q=null,yt=null,_t=null,ae=null;return{setTest:function(jt){L||(jt?tt(i.STENCIL_TEST):Rt(i.STENCIL_TEST))},setMask:function(jt){st!==jt&&!L&&(i.stencilMask(jt),st=jt)},setFunc:function(jt,an,on){(J!==jt||lt!==an||mt!==on)&&(i.stencilFunc(jt,an,on),J=jt,lt=an,mt=on)},setOp:function(jt,an,on){(Q!==jt||yt!==an||_t!==on)&&(i.stencilOp(jt,an,on),Q=jt,yt=an,_t=on)},setLocked:function(jt){L=jt},setClear:function(jt){ae!==jt&&(i.clearStencil(jt),ae=jt)},reset:function(){L=!1,st=null,J=null,lt=null,mt=null,Q=null,yt=null,_t=null,ae=null}}}let r=new e,a=new n,o=new s,c=new WeakMap,l=new WeakMap,u={},d={},h={},p=new WeakMap,g=[],y=null,m=!1,f=null,w=null,A=null,M=null,T=null,b=null,C=null,_=new Pt(0,0,0),E=0,P=!1,I=null,D=null,W=null,X=null,R=null,B=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS),H=!1,$=0,j=i.getParameter(i.VERSION);j.indexOf("WebGL")!==-1?($=parseFloat(/^WebGL (\d)/.exec(j)[1]),H=$>=1):j.indexOf("OpenGL ES")!==-1&&($=parseFloat(/^OpenGL ES (\d)/.exec(j)[1]),H=$>=2);let nt=null,ct={},dt=i.getParameter(i.SCISSOR_BOX),zt=i.getParameter(i.VIEWPORT),$t=new se().fromArray(dt),Ot=new se().fromArray(zt);function Y(L,st,J,lt){let mt=new Uint8Array(4),Q=i.createTexture();i.bindTexture(L,Q),i.texParameteri(L,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(L,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let yt=0;yt<J;yt++)L===i.TEXTURE_3D||L===i.TEXTURE_2D_ARRAY?i.texImage3D(st,0,i.RGBA,1,1,lt,0,i.RGBA,i.UNSIGNED_BYTE,mt):i.texImage2D(st+yt,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,mt);return Q}let et={};et[i.TEXTURE_2D]=Y(i.TEXTURE_2D,i.TEXTURE_2D,1),et[i.TEXTURE_CUBE_MAP]=Y(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),et[i.TEXTURE_2D_ARRAY]=Y(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),et[i.TEXTURE_3D]=Y(i.TEXTURE_3D,i.TEXTURE_3D,1,1),r.setClear(0,0,0,1),a.setClear(1),o.setClear(0),tt(i.DEPTH_TEST),a.setFunc(ii),de(!1),ge(vo),tt(i.CULL_FACE),Xt(fn);function tt(L){u[L]!==!0&&(i.enable(L),u[L]=!0)}function Rt(L){u[L]!==!1&&(i.disable(L),u[L]=!1)}function Lt(L,st){return h[L]!==st?(i.bindFramebuffer(L,st),h[L]=st,L===i.DRAW_FRAMEBUFFER&&(h[i.FRAMEBUFFER]=st),L===i.FRAMEBUFFER&&(h[i.DRAW_FRAMEBUFFER]=st),!0):!1}function Tt(L,st){let J=g,lt=!1;if(L){J=p.get(st),J===void 0&&(J=[],p.set(st,J));let mt=L.textures;if(J.length!==mt.length||J[0]!==i.COLOR_ATTACHMENT0){for(let Q=0,yt=mt.length;Q<yt;Q++)J[Q]=i.COLOR_ATTACHMENT0+Q;J.length=mt.length,lt=!0}}else J[0]!==i.BACK&&(J[0]=i.BACK,lt=!0);lt&&i.drawBuffers(J)}function le(L){return y!==L?(i.useProgram(L),y=L,!0):!1}let Vt={[On]:i.FUNC_ADD,[Yl]:i.FUNC_SUBTRACT,[Zl]:i.FUNC_REVERSE_SUBTRACT};Vt[$l]=i.MIN,Vt[Jl]=i.MAX;let Jt={[Kl]:i.ZERO,[Ql]:i.ONE,[jl]:i.SRC_COLOR,[rr]:i.SRC_ALPHA,[rc]:i.SRC_ALPHA_SATURATE,[ic]:i.DST_COLOR,[ec]:i.DST_ALPHA,[tc]:i.ONE_MINUS_SRC_COLOR,[ar]:i.ONE_MINUS_SRC_ALPHA,[sc]:i.ONE_MINUS_DST_COLOR,[nc]:i.ONE_MINUS_DST_ALPHA,[ac]:i.CONSTANT_COLOR,[oc]:i.ONE_MINUS_CONSTANT_COLOR,[lc]:i.CONSTANT_ALPHA,[cc]:i.ONE_MINUS_CONSTANT_ALPHA};function Xt(L,st,J,lt,mt,Q,yt,_t,ae,jt){if(L===fn){m===!0&&(Rt(i.BLEND),m=!1);return}if(m===!1&&(tt(i.BLEND),m=!0),L!==ql){if(L!==f||jt!==P){if((w!==On||T!==On)&&(i.blendEquation(i.FUNC_ADD),w=On,T=On),jt)switch(L){case ni:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case yo:i.blendFunc(i.ONE,i.ONE);break;case Mo:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case bo:i.blendFuncSeparate(i.DST_COLOR,i.ONE_MINUS_SRC_ALPHA,i.ZERO,i.ONE);break;default:Ct("WebGLState: Invalid blending: ",L);break}else switch(L){case ni:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case yo:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE,i.ONE,i.ONE);break;case Mo:Ct("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case bo:Ct("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:Ct("WebGLState: Invalid blending: ",L);break}A=null,M=null,b=null,C=null,_.set(0,0,0),E=0,f=L,P=jt}return}mt=mt||st,Q=Q||J,yt=yt||lt,(st!==w||mt!==T)&&(i.blendEquationSeparate(Vt[st],Vt[mt]),w=st,T=mt),(J!==A||lt!==M||Q!==b||yt!==C)&&(i.blendFuncSeparate(Jt[J],Jt[lt],Jt[Q],Jt[yt]),A=J,M=lt,b=Q,C=yt),(_t.equals(_)===!1||ae!==E)&&(i.blendColor(_t.r,_t.g,_t.b,ae),_.copy(_t),E=ae),f=L,P=!1}function Ht(L,st){L.side===Ze?Rt(i.CULL_FACE):tt(i.CULL_FACE);let J=L.side===Ee;st&&(J=!J),de(J),L.blending===ni&&L.transparent===!1?Xt(fn):Xt(L.blending,L.blendEquation,L.blendSrc,L.blendDst,L.blendEquationAlpha,L.blendSrcAlpha,L.blendDstAlpha,L.blendColor,L.blendAlpha,L.premultipliedAlpha),a.setFunc(L.depthFunc),a.setTest(L.depthTest),a.setMask(L.depthWrite),r.setMask(L.colorWrite);let lt=L.stencilWrite;o.setTest(lt),lt&&(o.setMask(L.stencilWriteMask),o.setFunc(L.stencilFunc,L.stencilRef,L.stencilFuncMask),o.setOp(L.stencilFail,L.stencilZFail,L.stencilZPass)),be(L.polygonOffset,L.polygonOffsetFactor,L.polygonOffsetUnits),L.alphaToCoverage===!0?tt(i.SAMPLE_ALPHA_TO_COVERAGE):Rt(i.SAMPLE_ALPHA_TO_COVERAGE)}function de(L){I!==L&&(L?i.frontFace(i.CW):i.frontFace(i.CCW),I=L)}function ge(L){L!==Hl?(tt(i.CULL_FACE),L!==D&&(L===vo?i.cullFace(i.BACK):L===Wl?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):Rt(i.CULL_FACE),D=L}function ve(L){L!==W&&(H&&i.lineWidth(L),W=L)}function be(L,st,J){L?(tt(i.POLYGON_OFFSET_FILL),(X!==st||R!==J)&&(X=st,R=J,a.getReversed()&&(st=-st),i.polygonOffset(st,J))):Rt(i.POLYGON_OFFSET_FILL)}function re(L){L?tt(i.SCISSOR_TEST):Rt(i.SCISSOR_TEST)}function fe(L){L===void 0&&(L=i.TEXTURE0+B-1),nt!==L&&(i.activeTexture(L),nt=L)}function U(L,st,J){J===void 0&&(nt===null?J=i.TEXTURE0+B-1:J=nt);let lt=ct[J];lt===void 0&&(lt={type:void 0,texture:void 0},ct[J]=lt),(lt.type!==L||lt.texture!==st)&&(nt!==J&&(i.activeTexture(J),nt=J),i.bindTexture(L,st||et[L]),lt.type=L,lt.texture=st)}function Le(){let L=ct[nt];L!==void 0&&L.type!==void 0&&(i.bindTexture(L.type,null),L.type=void 0,L.texture=void 0)}function Yt(){try{i.compressedTexImage2D(...arguments)}catch(L){Ct("WebGLState:",L)}}function S(){try{i.compressedTexImage3D(...arguments)}catch(L){Ct("WebGLState:",L)}}function x(){try{i.texSubImage2D(...arguments)}catch(L){Ct("WebGLState:",L)}}function O(){try{i.texSubImage3D(...arguments)}catch(L){Ct("WebGLState:",L)}}function k(){try{i.compressedTexSubImage2D(...arguments)}catch(L){Ct("WebGLState:",L)}}function q(){try{i.compressedTexSubImage3D(...arguments)}catch(L){Ct("WebGLState:",L)}}function it(){try{i.texStorage2D(...arguments)}catch(L){Ct("WebGLState:",L)}}function rt(){try{i.texStorage3D(...arguments)}catch(L){Ct("WebGLState:",L)}}function Z(){try{i.texImage2D(...arguments)}catch(L){Ct("WebGLState:",L)}}function K(){try{i.texImage3D(...arguments)}catch(L){Ct("WebGLState:",L)}}function at(L){return d[L]!==void 0?d[L]:i.getParameter(L)}function Mt(L,st){d[L]!==st&&(i.pixelStorei(L,st),d[L]=st)}function ht(L){$t.equals(L)===!1&&(i.scissor(L.x,L.y,L.z,L.w),$t.copy(L))}function ot(L){Ot.equals(L)===!1&&(i.viewport(L.x,L.y,L.z,L.w),Ot.copy(L))}function Et(L,st){let J=l.get(st);J===void 0&&(J=new WeakMap,l.set(st,J));let lt=J.get(L);lt===void 0&&(lt=i.getUniformBlockIndex(st,L.name),J.set(L,lt))}function At(L,st){let lt=l.get(st).get(L);c.get(st)!==lt&&(i.uniformBlockBinding(st,lt,L.__bindingPointIndex),c.set(st,lt))}function Dt(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.blendColor(0,0,0,0),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),a.setReversed(!1),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),i.pixelStorei(i.PACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,!1),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,i.BROWSER_DEFAULT_WEBGL),i.pixelStorei(i.PACK_ROW_LENGTH,0),i.pixelStorei(i.PACK_SKIP_PIXELS,0),i.pixelStorei(i.PACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_IMAGE_HEIGHT,0),i.pixelStorei(i.UNPACK_SKIP_PIXELS,0),i.pixelStorei(i.UNPACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_SKIP_IMAGES,0),u={},d={},nt=null,ct={},h={},p=new WeakMap,g=[],y=null,m=!1,f=null,w=null,A=null,M=null,T=null,b=null,C=null,_=new Pt(0,0,0),E=0,P=!1,I=null,D=null,W=null,X=null,R=null,$t.set(0,0,i.canvas.width,i.canvas.height),Ot.set(0,0,i.canvas.width,i.canvas.height),r.reset(),a.reset(),o.reset()}return{buffers:{color:r,depth:a,stencil:o},enable:tt,disable:Rt,bindFramebuffer:Lt,drawBuffers:Tt,useProgram:le,setBlending:Xt,setMaterial:Ht,setFlipSided:de,setCullFace:ge,setLineWidth:ve,setPolygonOffset:be,setScissorTest:re,activeTexture:fe,bindTexture:U,unbindTexture:Le,compressedTexImage2D:Yt,compressedTexImage3D:S,texImage2D:Z,texImage3D:K,pixelStorei:Mt,getParameter:at,updateUBOMapping:Et,uniformBlockBinding:At,texStorage2D:it,texStorage3D:rt,texSubImage2D:x,texSubImage3D:O,compressedTexSubImage2D:k,compressedTexSubImage3D:q,scissor:ht,viewport:ot,reset:Dt}}function Xm(i,t,e,n,s,r,a){let o=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,c=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),l=new Ut,u=new WeakMap,d=new Set,h,p=new WeakMap,g=!1;try{g=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function y(S,x){return g?new OffscreenCanvas(S,x):is("canvas")}function m(S,x,O){let k=1,q=Yt(S);if((q.width>O||q.height>O)&&(k=O/Math.max(q.width,q.height)),k<1)if(typeof HTMLImageElement<"u"&&S instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&S instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&S instanceof ImageBitmap||typeof VideoFrame<"u"&&S instanceof VideoFrame){let it=Math.floor(k*q.width),rt=Math.floor(k*q.height);h===void 0&&(h=y(it,rt));let Z=x?y(it,rt):h;return Z.width=it,Z.height=rt,Z.getContext("2d").drawImage(S,0,0,it,rt),wt("WebGLRenderer: Texture has been resized from ("+q.width+"x"+q.height+") to ("+it+"x"+rt+")."),Z}else return"data"in S&&wt("WebGLRenderer: Image in DataTexture is too big ("+q.width+"x"+q.height+")."),S;return S}function f(S){return S.generateMipmaps}function w(S){i.generateMipmap(S)}function A(S){return S.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:S.isWebGL3DRenderTarget?i.TEXTURE_3D:S.isWebGLArrayRenderTarget||S.isCompressedArrayTexture?i.TEXTURE_2D_ARRAY:i.TEXTURE_2D}function M(S,x,O,k,q,it=!1){if(S!==null){if(i[S]!==void 0)return i[S];wt("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+S+"'")}let rt;k&&(rt=t.get("EXT_texture_norm16"),rt||wt("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let Z=x;if(x===i.RED&&(O===i.FLOAT&&(Z=i.R32F),O===i.HALF_FLOAT&&(Z=i.R16F),O===i.UNSIGNED_BYTE&&(Z=i.R8),O===i.UNSIGNED_SHORT&&rt&&(Z=rt.R16_EXT),O===i.SHORT&&rt&&(Z=rt.R16_SNORM_EXT)),x===i.RED_INTEGER&&(O===i.UNSIGNED_BYTE&&(Z=i.R8UI),O===i.UNSIGNED_SHORT&&(Z=i.R16UI),O===i.UNSIGNED_INT&&(Z=i.R32UI),O===i.BYTE&&(Z=i.R8I),O===i.SHORT&&(Z=i.R16I),O===i.INT&&(Z=i.R32I)),x===i.RG&&(O===i.FLOAT&&(Z=i.RG32F),O===i.HALF_FLOAT&&(Z=i.RG16F),O===i.UNSIGNED_BYTE&&(Z=i.RG8),O===i.UNSIGNED_SHORT&&rt&&(Z=rt.RG16_EXT),O===i.SHORT&&rt&&(Z=rt.RG16_SNORM_EXT)),x===i.RG_INTEGER&&(O===i.UNSIGNED_BYTE&&(Z=i.RG8UI),O===i.UNSIGNED_SHORT&&(Z=i.RG16UI),O===i.UNSIGNED_INT&&(Z=i.RG32UI),O===i.BYTE&&(Z=i.RG8I),O===i.SHORT&&(Z=i.RG16I),O===i.INT&&(Z=i.RG32I)),x===i.RGB_INTEGER&&(O===i.UNSIGNED_BYTE&&(Z=i.RGB8UI),O===i.UNSIGNED_SHORT&&(Z=i.RGB16UI),O===i.UNSIGNED_INT&&(Z=i.RGB32UI),O===i.BYTE&&(Z=i.RGB8I),O===i.SHORT&&(Z=i.RGB16I),O===i.INT&&(Z=i.RGB32I)),x===i.RGBA_INTEGER&&(O===i.UNSIGNED_BYTE&&(Z=i.RGBA8UI),O===i.UNSIGNED_SHORT&&(Z=i.RGBA16UI),O===i.UNSIGNED_INT&&(Z=i.RGBA32UI),O===i.BYTE&&(Z=i.RGBA8I),O===i.SHORT&&(Z=i.RGBA16I),O===i.INT&&(Z=i.RGBA32I)),x===i.RGB&&(O===i.UNSIGNED_SHORT&&rt&&(Z=rt.RGB16_EXT),O===i.SHORT&&rt&&(Z=rt.RGB16_SNORM_EXT),O===i.UNSIGNED_INT_5_9_9_9_REV&&(Z=i.RGB9_E5),O===i.UNSIGNED_INT_10F_11F_11F_REV&&(Z=i.R11F_G11F_B10F)),x===i.RGBA){let K=it?ns:kt.getTransfer(q);O===i.FLOAT&&(Z=i.RGBA32F),O===i.HALF_FLOAT&&(Z=i.RGBA16F),O===i.UNSIGNED_BYTE&&(Z=K===qt?i.SRGB8_ALPHA8:i.RGBA8),O===i.UNSIGNED_SHORT&&rt&&(Z=rt.RGBA16_EXT),O===i.SHORT&&rt&&(Z=rt.RGBA16_SNORM_EXT),O===i.UNSIGNED_SHORT_4_4_4_4&&(Z=i.RGBA4),O===i.UNSIGNED_SHORT_5_5_5_1&&(Z=i.RGB5_A1)}return(Z===i.R16F||Z===i.R32F||Z===i.RG16F||Z===i.RG32F||Z===i.RGBA16F||Z===i.RGBA32F)&&t.get("EXT_color_buffer_float"),Z}function T(S,x){let O;return S?x===null||x===sn||x===ki?O=i.DEPTH24_STENCIL8:x===rn?O=i.DEPTH32F_STENCIL8:x===Vi&&(O=i.DEPTH24_STENCIL8,wt("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):x===null||x===sn||x===ki?O=i.DEPTH_COMPONENT24:x===rn?O=i.DEPTH_COMPONENT32F:x===Vi&&(O=i.DEPTH_COMPONENT16),O}function b(S,x){return f(S)===!0||S.isFramebufferTexture&&S.minFilter!==Me&&S.minFilter!==Se?Math.log2(Math.max(x.width,x.height))+1:S.mipmaps!==void 0&&S.mipmaps.length>0?S.mipmaps.length:S.isCompressedTexture&&Array.isArray(S.image)?x.mipmaps.length:1}function C(S){let x=S.target;x.removeEventListener("dispose",C),E(x),x.isVideoTexture&&u.delete(x),x.isHTMLTexture&&d.delete(x)}function _(S){let x=S.target;x.removeEventListener("dispose",_),I(x)}function E(S){let x=n.get(S);if(x.__webglInit===void 0)return;let O=S.source,k=p.get(O);if(k){let q=k[x.__cacheKey];q.usedTimes--,q.usedTimes===0&&P(S),Object.keys(k).length===0&&p.delete(O)}n.remove(S)}function P(S){let x=n.get(S);i.deleteTexture(x.__webglTexture);let O=S.source,k=p.get(O);delete k[x.__cacheKey],a.memory.textures--}function I(S){let x=n.get(S);if(S.depthTexture&&(S.depthTexture.dispose(),n.remove(S.depthTexture)),S.isWebGLCubeRenderTarget)for(let k=0;k<6;k++){if(Array.isArray(x.__webglFramebuffer[k]))for(let q=0;q<x.__webglFramebuffer[k].length;q++)i.deleteFramebuffer(x.__webglFramebuffer[k][q]);else i.deleteFramebuffer(x.__webglFramebuffer[k]);x.__webglDepthbuffer&&i.deleteRenderbuffer(x.__webglDepthbuffer[k])}else{if(Array.isArray(x.__webglFramebuffer))for(let k=0;k<x.__webglFramebuffer.length;k++)i.deleteFramebuffer(x.__webglFramebuffer[k]);else i.deleteFramebuffer(x.__webglFramebuffer);if(x.__webglDepthbuffer&&i.deleteRenderbuffer(x.__webglDepthbuffer),x.__webglMultisampledFramebuffer&&i.deleteFramebuffer(x.__webglMultisampledFramebuffer),x.__webglColorRenderbuffer)for(let k=0;k<x.__webglColorRenderbuffer.length;k++)x.__webglColorRenderbuffer[k]&&i.deleteRenderbuffer(x.__webglColorRenderbuffer[k]);x.__webglDepthRenderbuffer&&i.deleteRenderbuffer(x.__webglDepthRenderbuffer)}let O=S.textures;for(let k=0,q=O.length;k<q;k++){let it=n.get(O[k]);it.__webglTexture&&(i.deleteTexture(it.__webglTexture),a.memory.textures--),n.remove(O[k])}n.remove(S)}let D=0;function W(){D=0}function X(){return D}function R(S){D=S}function B(){let S=D;return S>=s.maxTextures&&wt("WebGLTextures: Trying to use "+S+" texture units while this GPU supports only "+s.maxTextures),D+=1,S}function H(S){let x=[];return x.push(S.wrapS),x.push(S.wrapT),x.push(S.wrapR||0),x.push(S.magFilter),x.push(S.minFilter),x.push(S.anisotropy),x.push(S.internalFormat),x.push(S.format),x.push(S.type),x.push(S.generateMipmaps),x.push(S.premultiplyAlpha),x.push(S.flipY),x.push(S.unpackAlignment),x.push(S.colorSpace),x.join()}function $(S,x){let O=n.get(S);if(S.isVideoTexture&&U(S),S.isRenderTargetTexture===!1&&S.isExternalTexture!==!0&&S.version>0&&O.__version!==S.version){let k=S.image;if(k===null)wt("WebGLRenderer: Texture marked for update but no image data found.");else if(k.complete===!1)wt("WebGLRenderer: Texture marked for update but image is incomplete");else{Rt(O,S,x);return}}else S.isExternalTexture&&(O.__webglTexture=S.sourceTexture?S.sourceTexture:null);e.bindTexture(i.TEXTURE_2D,O.__webglTexture,i.TEXTURE0+x)}function j(S,x){let O=n.get(S);if(S.isRenderTargetTexture===!1&&S.version>0&&O.__version!==S.version){Rt(O,S,x);return}else S.isExternalTexture&&(O.__webglTexture=S.sourceTexture?S.sourceTexture:null);e.bindTexture(i.TEXTURE_2D_ARRAY,O.__webglTexture,i.TEXTURE0+x)}function nt(S,x){let O=n.get(S);if(S.isRenderTargetTexture===!1&&S.version>0&&O.__version!==S.version){Rt(O,S,x);return}e.bindTexture(i.TEXTURE_3D,O.__webglTexture,i.TEXTURE0+x)}function ct(S,x){let O=n.get(S);if(S.isCubeDepthTexture!==!0&&S.version>0&&O.__version!==S.version){Lt(O,S,x);return}e.bindTexture(i.TEXTURE_CUBE_MAP,O.__webglTexture,i.TEXTURE0+x)}let dt={[pr]:i.REPEAT,[hn]:i.CLAMP_TO_EDGE,[mr]:i.MIRRORED_REPEAT},zt={[Me]:i.NEAREST,[dc]:i.NEAREST_MIPMAP_NEAREST,[Ss]:i.NEAREST_MIPMAP_LINEAR,[Se]:i.LINEAR,[zr]:i.LINEAR_MIPMAP_NEAREST,[Wn]:i.LINEAR_MIPMAP_LINEAR},$t={[mc]:i.NEVER,[yc]:i.ALWAYS,[gc]:i.LESS,[Sa]:i.LEQUAL,[xc]:i.EQUAL,[Ea]:i.GEQUAL,[_c]:i.GREATER,[vc]:i.NOTEQUAL};function Ot(S,x){if(x.type===rn&&t.has("OES_texture_float_linear")===!1&&(x.magFilter===Se||x.magFilter===zr||x.magFilter===Ss||x.magFilter===Wn||x.minFilter===Se||x.minFilter===zr||x.minFilter===Ss||x.minFilter===Wn)&&wt("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),i.texParameteri(S,i.TEXTURE_WRAP_S,dt[x.wrapS]),i.texParameteri(S,i.TEXTURE_WRAP_T,dt[x.wrapT]),(S===i.TEXTURE_3D||S===i.TEXTURE_2D_ARRAY)&&i.texParameteri(S,i.TEXTURE_WRAP_R,dt[x.wrapR]),i.texParameteri(S,i.TEXTURE_MAG_FILTER,zt[x.magFilter]),i.texParameteri(S,i.TEXTURE_MIN_FILTER,zt[x.minFilter]),x.compareFunction&&(i.texParameteri(S,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(S,i.TEXTURE_COMPARE_FUNC,$t[x.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(x.magFilter===Me||x.minFilter!==Ss&&x.minFilter!==Wn||x.type===rn&&t.has("OES_texture_float_linear")===!1)return;if(x.anisotropy>1||n.get(x).__currentAnisotropy){let O=t.get("EXT_texture_filter_anisotropic");i.texParameterf(S,O.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(x.anisotropy,s.getMaxAnisotropy())),n.get(x).__currentAnisotropy=x.anisotropy}}}function Y(S,x){let O=!1;S.__webglInit===void 0&&(S.__webglInit=!0,x.addEventListener("dispose",C));let k=x.source,q=p.get(k);q===void 0&&(q={},p.set(k,q));let it=H(x);if(it!==S.__cacheKey){q[it]===void 0&&(q[it]={texture:i.createTexture(),usedTimes:0},a.memory.textures++,O=!0),q[it].usedTimes++;let rt=q[S.__cacheKey];rt!==void 0&&(q[S.__cacheKey].usedTimes--,rt.usedTimes===0&&P(x)),S.__cacheKey=it,S.__webglTexture=q[it].texture}return O}function et(S,x,O){return Math.floor(Math.floor(S/O)/x)}function tt(S,x,O,k){let it=S.updateRanges;if(it.length===0)e.texSubImage2D(i.TEXTURE_2D,0,0,0,x.width,x.height,O,k,x.data);else{it.sort((Mt,ht)=>Mt.start-ht.start);let rt=0;for(let Mt=1;Mt<it.length;Mt++){let ht=it[rt],ot=it[Mt],Et=ht.start+ht.count,At=et(ot.start,x.width,4),Dt=et(ht.start,x.width,4);ot.start<=Et+1&&At===Dt&&et(ot.start+ot.count-1,x.width,4)===At?ht.count=Math.max(ht.count,ot.start+ot.count-ht.start):(++rt,it[rt]=ot)}it.length=rt+1;let Z=e.getParameter(i.UNPACK_ROW_LENGTH),K=e.getParameter(i.UNPACK_SKIP_PIXELS),at=e.getParameter(i.UNPACK_SKIP_ROWS);e.pixelStorei(i.UNPACK_ROW_LENGTH,x.width);for(let Mt=0,ht=it.length;Mt<ht;Mt++){let ot=it[Mt],Et=Math.floor(ot.start/4),At=Math.ceil(ot.count/4),Dt=Et%x.width,L=Math.floor(Et/x.width),st=At,J=1;e.pixelStorei(i.UNPACK_SKIP_PIXELS,Dt),e.pixelStorei(i.UNPACK_SKIP_ROWS,L),e.texSubImage2D(i.TEXTURE_2D,0,Dt,L,st,J,O,k,x.data)}S.clearUpdateRanges(),e.pixelStorei(i.UNPACK_ROW_LENGTH,Z),e.pixelStorei(i.UNPACK_SKIP_PIXELS,K),e.pixelStorei(i.UNPACK_SKIP_ROWS,at)}}function Rt(S,x,O){let k=i.TEXTURE_2D;(x.isDataArrayTexture||x.isCompressedArrayTexture)&&(k=i.TEXTURE_2D_ARRAY),x.isData3DTexture&&(k=i.TEXTURE_3D);let q=Y(S,x),it=x.source;e.bindTexture(k,S.__webglTexture,i.TEXTURE0+O);let rt=n.get(it);if(it.version!==rt.__version||q===!0){if(e.activeTexture(i.TEXTURE0+O),(typeof ImageBitmap<"u"&&x.image instanceof ImageBitmap)===!1){let J=kt.getPrimaries(kt.workingColorSpace),lt=x.colorSpace===Tn?null:kt.getPrimaries(x.colorSpace),mt=x.colorSpace===Tn||J===lt?i.NONE:i.BROWSER_DEFAULT_WEBGL;e.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,x.flipY),e.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),e.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,mt)}e.pixelStorei(i.UNPACK_ALIGNMENT,x.unpackAlignment);let K=m(x.image,!1,s.maxTextureSize);K=Le(x,K);let at=r.convert(x.format,x.colorSpace),Mt=r.convert(x.type),ht=M(x.internalFormat,at,Mt,x.normalized,x.colorSpace,x.isVideoTexture);Ot(k,x);let ot,Et=x.mipmaps,At=x.isVideoTexture!==!0,Dt=rt.__version===void 0||q===!0,L=it.dataReady,st=b(x,K);if(x.isDepthTexture)ht=T(x.format===Xn,x.type),Dt&&(At?e.texStorage2D(i.TEXTURE_2D,1,ht,K.width,K.height):e.texImage2D(i.TEXTURE_2D,0,ht,K.width,K.height,0,at,Mt,null));else if(x.isDataTexture)if(Et.length>0){At&&Dt&&e.texStorage2D(i.TEXTURE_2D,st,ht,Et[0].width,Et[0].height);for(let J=0,lt=Et.length;J<lt;J++)ot=Et[J],At?L&&e.texSubImage2D(i.TEXTURE_2D,J,0,0,ot.width,ot.height,at,Mt,ot.data):e.texImage2D(i.TEXTURE_2D,J,ht,ot.width,ot.height,0,at,Mt,ot.data);x.generateMipmaps=!1}else At?(Dt&&e.texStorage2D(i.TEXTURE_2D,st,ht,K.width,K.height),L&&tt(x,K,at,Mt)):e.texImage2D(i.TEXTURE_2D,0,ht,K.width,K.height,0,at,Mt,K.data);else if(x.isCompressedTexture)if(x.isCompressedArrayTexture){At&&Dt&&e.texStorage3D(i.TEXTURE_2D_ARRAY,st,ht,Et[0].width,Et[0].height,K.depth);for(let J=0,lt=Et.length;J<lt;J++)if(ot=Et[J],x.format!==$e)if(at!==null)if(At){if(L)if(x.layerUpdates.size>0){let mt=Xo(ot.width,ot.height,x.format,x.type);for(let Q of x.layerUpdates){let yt=ot.data.subarray(Q*mt/ot.data.BYTES_PER_ELEMENT,(Q+1)*mt/ot.data.BYTES_PER_ELEMENT);e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,J,0,0,Q,ot.width,ot.height,1,at,yt)}x.clearLayerUpdates()}else e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,J,0,0,0,ot.width,ot.height,K.depth,at,ot.data)}else e.compressedTexImage3D(i.TEXTURE_2D_ARRAY,J,ht,ot.width,ot.height,K.depth,0,ot.data,0,0);else wt("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else At?L&&e.texSubImage3D(i.TEXTURE_2D_ARRAY,J,0,0,0,ot.width,ot.height,K.depth,at,Mt,ot.data):e.texImage3D(i.TEXTURE_2D_ARRAY,J,ht,ot.width,ot.height,K.depth,0,at,Mt,ot.data)}else{At&&Dt&&e.texStorage2D(i.TEXTURE_2D,st,ht,Et[0].width,Et[0].height);for(let J=0,lt=Et.length;J<lt;J++)ot=Et[J],x.format!==$e?at!==null?At?L&&e.compressedTexSubImage2D(i.TEXTURE_2D,J,0,0,ot.width,ot.height,at,ot.data):e.compressedTexImage2D(i.TEXTURE_2D,J,ht,ot.width,ot.height,0,ot.data):wt("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):At?L&&e.texSubImage2D(i.TEXTURE_2D,J,0,0,ot.width,ot.height,at,Mt,ot.data):e.texImage2D(i.TEXTURE_2D,J,ht,ot.width,ot.height,0,at,Mt,ot.data)}else if(x.isDataArrayTexture)if(At){if(Dt&&e.texStorage3D(i.TEXTURE_2D_ARRAY,st,ht,K.width,K.height,K.depth),L)if(x.layerUpdates.size>0){let J=Xo(K.width,K.height,x.format,x.type);for(let lt of x.layerUpdates){let mt=K.data.subarray(lt*J/K.data.BYTES_PER_ELEMENT,(lt+1)*J/K.data.BYTES_PER_ELEMENT);e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,lt,K.width,K.height,1,at,Mt,mt)}x.clearLayerUpdates()}else e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,K.width,K.height,K.depth,at,Mt,K.data)}else e.texImage3D(i.TEXTURE_2D_ARRAY,0,ht,K.width,K.height,K.depth,0,at,Mt,K.data);else if(x.isData3DTexture)At?(Dt&&e.texStorage3D(i.TEXTURE_3D,st,ht,K.width,K.height,K.depth),L&&e.texSubImage3D(i.TEXTURE_3D,0,0,0,0,K.width,K.height,K.depth,at,Mt,K.data)):e.texImage3D(i.TEXTURE_3D,0,ht,K.width,K.height,K.depth,0,at,Mt,K.data);else if(x.isFramebufferTexture){if(Dt)if(At)e.texStorage2D(i.TEXTURE_2D,st,ht,K.width,K.height);else{let J=K.width,lt=K.height;for(let mt=0;mt<st;mt++)e.texImage2D(i.TEXTURE_2D,mt,ht,J,lt,0,at,Mt,null),J>>=1,lt>>=1}}else if(x.isHTMLTexture){if("texElementImage2D"in i){let J=i.canvas;if(J.hasAttribute("layoutsubtree")||J.setAttribute("layoutsubtree","true"),K.parentNode!==J){J.appendChild(K),d.add(x),J.onpaint=lt=>{let mt=lt.changedElements;for(let Q of d)mt.includes(Q.image)&&(Q.needsUpdate=!0)},J.requestPaint();return}if(i.texElementImage2D.length===3)i.texElementImage2D(i.TEXTURE_2D,i.RGBA8,K);else{let mt=i.RGBA,Q=i.RGBA,yt=i.UNSIGNED_BYTE;i.texElementImage2D(i.TEXTURE_2D,0,mt,Q,yt,K)}i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE)}}else if(Et.length>0){if(At&&Dt){let J=Yt(Et[0]);e.texStorage2D(i.TEXTURE_2D,st,ht,J.width,J.height)}for(let J=0,lt=Et.length;J<lt;J++)ot=Et[J],At?L&&e.texSubImage2D(i.TEXTURE_2D,J,0,0,at,Mt,ot):e.texImage2D(i.TEXTURE_2D,J,ht,at,Mt,ot);x.generateMipmaps=!1}else if(At){if(Dt){let J=Yt(K);e.texStorage2D(i.TEXTURE_2D,st,ht,J.width,J.height)}L&&e.texSubImage2D(i.TEXTURE_2D,0,0,0,at,Mt,K)}else e.texImage2D(i.TEXTURE_2D,0,ht,at,Mt,K);f(x)&&w(k),rt.__version=it.version,x.onUpdate&&x.onUpdate(x)}S.__version=x.version}function Lt(S,x,O){if(x.image.length!==6)return;let k=Y(S,x),q=x.source;e.bindTexture(i.TEXTURE_CUBE_MAP,S.__webglTexture,i.TEXTURE0+O);let it=n.get(q);if(q.version!==it.__version||k===!0){e.activeTexture(i.TEXTURE0+O);let rt=kt.getPrimaries(kt.workingColorSpace),Z=x.colorSpace===Tn?null:kt.getPrimaries(x.colorSpace),K=x.colorSpace===Tn||rt===Z?i.NONE:i.BROWSER_DEFAULT_WEBGL;e.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,x.flipY),e.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),e.pixelStorei(i.UNPACK_ALIGNMENT,x.unpackAlignment),e.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,K);let at=x.isCompressedTexture||x.image[0].isCompressedTexture,Mt=x.image[0]&&x.image[0].isDataTexture,ht=[];for(let Q=0;Q<6;Q++)!at&&!Mt?ht[Q]=m(x.image[Q],!0,s.maxCubemapSize):ht[Q]=Mt?x.image[Q].image:x.image[Q],ht[Q]=Le(x,ht[Q]);let ot=ht[0],Et=r.convert(x.format,x.colorSpace),At=r.convert(x.type),Dt=M(x.internalFormat,Et,At,x.normalized,x.colorSpace),L=x.isVideoTexture!==!0,st=it.__version===void 0||k===!0,J=q.dataReady,lt=b(x,ot);Ot(i.TEXTURE_CUBE_MAP,x);let mt;if(at){L&&st&&e.texStorage2D(i.TEXTURE_CUBE_MAP,lt,Dt,ot.width,ot.height);for(let Q=0;Q<6;Q++){mt=ht[Q].mipmaps;for(let yt=0;yt<mt.length;yt++){let _t=mt[yt];x.format!==$e?Et!==null?L?J&&e.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Q,yt,0,0,_t.width,_t.height,Et,_t.data):e.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Q,yt,Dt,_t.width,_t.height,0,_t.data):wt("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):L?J&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Q,yt,0,0,_t.width,_t.height,Et,At,_t.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Q,yt,Dt,_t.width,_t.height,0,Et,At,_t.data)}}}else{if(mt=x.mipmaps,L&&st){mt.length>0&&lt++;let Q=Yt(ht[0]);e.texStorage2D(i.TEXTURE_CUBE_MAP,lt,Dt,Q.width,Q.height)}for(let Q=0;Q<6;Q++)if(Mt){L?J&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Q,0,0,0,ht[Q].width,ht[Q].height,Et,At,ht[Q].data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Q,0,Dt,ht[Q].width,ht[Q].height,0,Et,At,ht[Q].data);for(let yt=0;yt<mt.length;yt++){let ae=mt[yt].image[Q].image;L?J&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Q,yt+1,0,0,ae.width,ae.height,Et,At,ae.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Q,yt+1,Dt,ae.width,ae.height,0,Et,At,ae.data)}}else{L?J&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Q,0,0,0,Et,At,ht[Q]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Q,0,Dt,Et,At,ht[Q]);for(let yt=0;yt<mt.length;yt++){let _t=mt[yt];L?J&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Q,yt+1,0,0,Et,At,_t.image[Q]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Q,yt+1,Dt,Et,At,_t.image[Q])}}}f(x)&&w(i.TEXTURE_CUBE_MAP),it.__version=q.version,x.onUpdate&&x.onUpdate(x)}S.__version=x.version}function Tt(S,x,O,k,q,it){let rt=r.convert(O.format,O.colorSpace),Z=r.convert(O.type),K=M(O.internalFormat,rt,Z,O.normalized,O.colorSpace),at=n.get(x),Mt=n.get(O);if(Mt.__renderTarget=x,!at.__hasExternalTextures){let ht=Math.max(1,x.width>>it),ot=Math.max(1,x.height>>it);q===i.TEXTURE_3D||q===i.TEXTURE_2D_ARRAY?e.texImage3D(q,it,K,ht,ot,x.depth,0,rt,Z,null):e.texImage2D(q,it,K,ht,ot,0,rt,Z,null)}e.bindFramebuffer(i.FRAMEBUFFER,S),fe(x)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,k,q,Mt.__webglTexture,0,re(x)):(q===i.TEXTURE_2D||q>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&q<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,k,q,Mt.__webglTexture,it),e.bindFramebuffer(i.FRAMEBUFFER,null)}function le(S,x,O){if(i.bindRenderbuffer(i.RENDERBUFFER,S),x.depthBuffer){let k=x.depthTexture,q=k&&k.isDepthTexture?k.type:null,it=T(x.stencilBuffer,q),rt=x.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;fe(x)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,re(x),it,x.width,x.height):O?i.renderbufferStorageMultisample(i.RENDERBUFFER,re(x),it,x.width,x.height):i.renderbufferStorage(i.RENDERBUFFER,it,x.width,x.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,rt,i.RENDERBUFFER,S)}else{let k=x.textures;for(let q=0;q<k.length;q++){let it=k[q],rt=r.convert(it.format,it.colorSpace),Z=r.convert(it.type),K=M(it.internalFormat,rt,Z,it.normalized,it.colorSpace);fe(x)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,re(x),K,x.width,x.height):O?i.renderbufferStorageMultisample(i.RENDERBUFFER,re(x),K,x.width,x.height):i.renderbufferStorage(i.RENDERBUFFER,K,x.width,x.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function Vt(S,x,O){let k=x.isWebGLCubeRenderTarget===!0;if(e.bindFramebuffer(i.FRAMEBUFFER,S),!(x.depthTexture&&x.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");let q=n.get(x.depthTexture);if(q.__renderTarget=x,(!q.__webglTexture||x.depthTexture.image.width!==x.width||x.depthTexture.image.height!==x.height)&&(x.depthTexture.image.width=x.width,x.depthTexture.image.height=x.height,x.depthTexture.needsUpdate=!0),k){if(q.__webglInit===void 0&&(q.__webglInit=!0,x.depthTexture.addEventListener("dispose",C)),q.__webglTexture===void 0){q.__webglTexture=i.createTexture(),e.bindTexture(i.TEXTURE_CUBE_MAP,q.__webglTexture),Ot(i.TEXTURE_CUBE_MAP,x.depthTexture);let at=r.convert(x.depthTexture.format),Mt=r.convert(x.depthTexture.type),ht;x.depthTexture.format===un?ht=i.DEPTH_COMPONENT24:x.depthTexture.format===Xn&&(ht=i.DEPTH24_STENCIL8);for(let ot=0;ot<6;ot++)i.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ot,0,ht,x.width,x.height,0,at,Mt,null)}}else $(x.depthTexture,0);let it=q.__webglTexture,rt=re(x),Z=k?i.TEXTURE_CUBE_MAP_POSITIVE_X+O:i.TEXTURE_2D,K=x.depthTexture.format===Xn?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;if(x.depthTexture.format===un)fe(x)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,K,Z,it,0,rt):i.framebufferTexture2D(i.FRAMEBUFFER,K,Z,it,0);else if(x.depthTexture.format===Xn)fe(x)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,K,Z,it,0,rt):i.framebufferTexture2D(i.FRAMEBUFFER,K,Z,it,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function Jt(S){let x=n.get(S),O=S.isWebGLCubeRenderTarget===!0;if(x.__boundDepthTexture!==S.depthTexture){let k=S.depthTexture;if(x.__depthDisposeCallback&&x.__depthDisposeCallback(),k){let q=()=>{delete x.__boundDepthTexture,delete x.__depthDisposeCallback,k.removeEventListener("dispose",q)};k.addEventListener("dispose",q),x.__depthDisposeCallback=q}x.__boundDepthTexture=k}if(S.depthTexture&&!x.__autoAllocateDepthBuffer)if(O)for(let k=0;k<6;k++)Vt(x.__webglFramebuffer[k],S,k);else{let k=S.texture.mipmaps;k&&k.length>0?Vt(x.__webglFramebuffer[0],S,0):Vt(x.__webglFramebuffer,S,0)}else if(O){x.__webglDepthbuffer=[];for(let k=0;k<6;k++)if(e.bindFramebuffer(i.FRAMEBUFFER,x.__webglFramebuffer[k]),x.__webglDepthbuffer[k]===void 0)x.__webglDepthbuffer[k]=i.createRenderbuffer(),le(x.__webglDepthbuffer[k],S,!1);else{let q=S.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,it=x.__webglDepthbuffer[k];i.bindRenderbuffer(i.RENDERBUFFER,it),i.framebufferRenderbuffer(i.FRAMEBUFFER,q,i.RENDERBUFFER,it)}}else{let k=S.texture.mipmaps;if(k&&k.length>0?e.bindFramebuffer(i.FRAMEBUFFER,x.__webglFramebuffer[0]):e.bindFramebuffer(i.FRAMEBUFFER,x.__webglFramebuffer),x.__webglDepthbuffer===void 0)x.__webglDepthbuffer=i.createRenderbuffer(),le(x.__webglDepthbuffer,S,!1);else{let q=S.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,it=x.__webglDepthbuffer;i.bindRenderbuffer(i.RENDERBUFFER,it),i.framebufferRenderbuffer(i.FRAMEBUFFER,q,i.RENDERBUFFER,it)}}e.bindFramebuffer(i.FRAMEBUFFER,null)}function Xt(S,x,O){let k=n.get(S);x!==void 0&&Tt(k.__webglFramebuffer,S,S.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),O!==void 0&&Jt(S)}function Ht(S){let x=S.texture,O=n.get(S),k=n.get(x);S.addEventListener("dispose",_);let q=S.textures,it=S.isWebGLCubeRenderTarget===!0,rt=q.length>1;if(rt||(k.__webglTexture===void 0&&(k.__webglTexture=i.createTexture()),k.__version=x.version,a.memory.textures++),it){O.__webglFramebuffer=[];for(let Z=0;Z<6;Z++)if(x.mipmaps&&x.mipmaps.length>0){O.__webglFramebuffer[Z]=[];for(let K=0;K<x.mipmaps.length;K++)O.__webglFramebuffer[Z][K]=i.createFramebuffer()}else O.__webglFramebuffer[Z]=i.createFramebuffer()}else{if(x.mipmaps&&x.mipmaps.length>0){O.__webglFramebuffer=[];for(let Z=0;Z<x.mipmaps.length;Z++)O.__webglFramebuffer[Z]=i.createFramebuffer()}else O.__webglFramebuffer=i.createFramebuffer();if(rt)for(let Z=0,K=q.length;Z<K;Z++){let at=n.get(q[Z]);at.__webglTexture===void 0&&(at.__webglTexture=i.createTexture(),a.memory.textures++)}if(S.samples>0&&fe(S)===!1){O.__webglMultisampledFramebuffer=i.createFramebuffer(),O.__webglColorRenderbuffer=[],e.bindFramebuffer(i.FRAMEBUFFER,O.__webglMultisampledFramebuffer);for(let Z=0;Z<q.length;Z++){let K=q[Z];O.__webglColorRenderbuffer[Z]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,O.__webglColorRenderbuffer[Z]);let at=r.convert(K.format,K.colorSpace),Mt=r.convert(K.type),ht=M(K.internalFormat,at,Mt,K.normalized,K.colorSpace,S.isXRRenderTarget===!0),ot=re(S);i.renderbufferStorageMultisample(i.RENDERBUFFER,ot,ht,S.width,S.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+Z,i.RENDERBUFFER,O.__webglColorRenderbuffer[Z])}i.bindRenderbuffer(i.RENDERBUFFER,null),S.depthBuffer&&(O.__webglDepthRenderbuffer=i.createRenderbuffer(),le(O.__webglDepthRenderbuffer,S,!0)),e.bindFramebuffer(i.FRAMEBUFFER,null)}}if(it){e.bindTexture(i.TEXTURE_CUBE_MAP,k.__webglTexture),Ot(i.TEXTURE_CUBE_MAP,x);for(let Z=0;Z<6;Z++)if(x.mipmaps&&x.mipmaps.length>0)for(let K=0;K<x.mipmaps.length;K++)Tt(O.__webglFramebuffer[Z][K],S,x,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,K);else Tt(O.__webglFramebuffer[Z],S,x,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,0);f(x)&&w(i.TEXTURE_CUBE_MAP),e.unbindTexture()}else if(rt){for(let Z=0,K=q.length;Z<K;Z++){let at=q[Z],Mt=n.get(at),ht=i.TEXTURE_2D;(S.isWebGL3DRenderTarget||S.isWebGLArrayRenderTarget)&&(ht=S.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture(ht,Mt.__webglTexture),Ot(ht,at),Tt(O.__webglFramebuffer,S,at,i.COLOR_ATTACHMENT0+Z,ht,0),f(at)&&w(ht)}e.unbindTexture()}else{let Z=i.TEXTURE_2D;if((S.isWebGL3DRenderTarget||S.isWebGLArrayRenderTarget)&&(Z=S.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture(Z,k.__webglTexture),Ot(Z,x),x.mipmaps&&x.mipmaps.length>0)for(let K=0;K<x.mipmaps.length;K++)Tt(O.__webglFramebuffer[K],S,x,i.COLOR_ATTACHMENT0,Z,K);else Tt(O.__webglFramebuffer,S,x,i.COLOR_ATTACHMENT0,Z,0);f(x)&&w(Z),e.unbindTexture()}S.depthBuffer&&Jt(S)}function de(S){let x=S.textures;for(let O=0,k=x.length;O<k;O++){let q=x[O];if(f(q)){let it=A(S),rt=n.get(q).__webglTexture;e.bindTexture(it,rt),w(it),e.unbindTexture()}}}let ge=[],ve=[];function be(S){if(S.samples>0){if(fe(S)===!1){let x=S.textures,O=S.width,k=S.height,q=i.COLOR_BUFFER_BIT,it=S.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,rt=n.get(S),Z=x.length>1;if(Z)for(let at=0;at<x.length;at++)e.bindFramebuffer(i.FRAMEBUFFER,rt.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+at,i.RENDERBUFFER,null),e.bindFramebuffer(i.FRAMEBUFFER,rt.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+at,i.TEXTURE_2D,null,0);e.bindFramebuffer(i.READ_FRAMEBUFFER,rt.__webglMultisampledFramebuffer);let K=S.texture.mipmaps;K&&K.length>0?e.bindFramebuffer(i.DRAW_FRAMEBUFFER,rt.__webglFramebuffer[0]):e.bindFramebuffer(i.DRAW_FRAMEBUFFER,rt.__webglFramebuffer);for(let at=0;at<x.length;at++){if(S.resolveDepthBuffer&&(S.depthBuffer&&(q|=i.DEPTH_BUFFER_BIT),S.stencilBuffer&&S.resolveStencilBuffer&&(q|=i.STENCIL_BUFFER_BIT)),Z){i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,rt.__webglColorRenderbuffer[at]);let Mt=n.get(x[at]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,Mt,0)}i.blitFramebuffer(0,0,O,k,0,0,O,k,q,i.NEAREST),c===!0&&(ge.length=0,ve.length=0,ge.push(i.COLOR_ATTACHMENT0+at),S.depthBuffer&&S.resolveDepthBuffer===!1&&(ge.push(it),ve.push(it),i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,ve)),i.invalidateFramebuffer(i.READ_FRAMEBUFFER,ge))}if(e.bindFramebuffer(i.READ_FRAMEBUFFER,null),e.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),Z)for(let at=0;at<x.length;at++){e.bindFramebuffer(i.FRAMEBUFFER,rt.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+at,i.RENDERBUFFER,rt.__webglColorRenderbuffer[at]);let Mt=n.get(x[at]).__webglTexture;e.bindFramebuffer(i.FRAMEBUFFER,rt.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+at,i.TEXTURE_2D,Mt,0)}e.bindFramebuffer(i.DRAW_FRAMEBUFFER,rt.__webglMultisampledFramebuffer)}else if(S.depthBuffer&&S.resolveDepthBuffer===!1&&c){let x=S.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[x])}}}function re(S){return Math.min(s.maxSamples,S.samples)}function fe(S){let x=n.get(S);return S.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&x.__useRenderToTexture!==!1}function U(S){let x=a.render.frame;u.get(S)!==x&&(u.set(S,x),S.update())}function Le(S,x){let O=S.colorSpace,k=S.format,q=S.type;return S.isCompressedTexture===!0||S.isVideoTexture===!0||O!==es&&O!==Tn&&(kt.getTransfer(O)===qt?(k!==$e||q!==Ne)&&wt("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):Ct("WebGLTextures: Unsupported texture color space:",O)),x}function Yt(S){return typeof HTMLImageElement<"u"&&S instanceof HTMLImageElement?(l.width=S.naturalWidth||S.width,l.height=S.naturalHeight||S.height):typeof VideoFrame<"u"&&S instanceof VideoFrame?(l.width=S.displayWidth,l.height=S.displayHeight):(l.width=S.width,l.height=S.height),l}this.allocateTextureUnit=B,this.resetTextureUnits=W,this.getTextureUnits=X,this.setTextureUnits=R,this.setTexture2D=$,this.setTexture2DArray=j,this.setTexture3D=nt,this.setTextureCube=ct,this.rebindTextures=Xt,this.setupRenderTarget=Ht,this.updateRenderTargetMipmap=de,this.updateMultisampleRenderTarget=be,this.setupDepthRenderbuffer=Jt,this.setupFrameBufferTexture=Tt,this.useMultisampledRTT=fe,this.isReversedDepthBuffer=function(){return e.buffers.depth.getReversed()}}function qm(i,t){function e(n,s=Tn){let r,a=kt.getTransfer(s);if(n===Ne)return i.UNSIGNED_BYTE;if(n===kr)return i.UNSIGNED_SHORT_4_4_4_4;if(n===Gr)return i.UNSIGNED_SHORT_5_5_5_1;if(n===No)return i.UNSIGNED_INT_5_9_9_9_REV;if(n===Uo)return i.UNSIGNED_INT_10F_11F_11F_REV;if(n===Lo)return i.BYTE;if(n===Do)return i.SHORT;if(n===Vi)return i.UNSIGNED_SHORT;if(n===Vr)return i.INT;if(n===sn)return i.UNSIGNED_INT;if(n===rn)return i.FLOAT;if(n===pn)return i.HALF_FLOAT;if(n===Fo)return i.ALPHA;if(n===Oo)return i.RGB;if(n===$e)return i.RGBA;if(n===un)return i.DEPTH_COMPONENT;if(n===Xn)return i.DEPTH_STENCIL;if(n===Bo)return i.RED;if(n===Hr)return i.RED_INTEGER;if(n===qn)return i.RG;if(n===Wr)return i.RG_INTEGER;if(n===Xr)return i.RGBA_INTEGER;if(n===Es||n===ws||n===Ts||n===As)if(a===qt)if(r=t.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===Es)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===ws)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===Ts)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===As)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=t.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===Es)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===ws)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===Ts)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===As)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===qr||n===Yr||n===Zr||n===$r)if(r=t.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===qr)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===Yr)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===Zr)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===$r)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===Jr||n===Kr||n===Qr||n===jr||n===ta||n===Cs||n===ea)if(r=t.get("WEBGL_compressed_texture_etc"),r!==null){if(n===Jr||n===Kr)return a===qt?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===Qr)return a===qt?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC;if(n===jr)return r.COMPRESSED_R11_EAC;if(n===ta)return r.COMPRESSED_SIGNED_R11_EAC;if(n===Cs)return r.COMPRESSED_RG11_EAC;if(n===ea)return r.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===na||n===ia||n===sa||n===ra||n===aa||n===oa||n===la||n===ca||n===ha||n===ua||n===da||n===fa||n===pa||n===ma)if(r=t.get("WEBGL_compressed_texture_astc"),r!==null){if(n===na)return a===qt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===ia)return a===qt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===sa)return a===qt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===ra)return a===qt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===aa)return a===qt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===oa)return a===qt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===la)return a===qt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===ca)return a===qt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===ha)return a===qt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===ua)return a===qt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===da)return a===qt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===fa)return a===qt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===pa)return a===qt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===ma)return a===qt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===ga||n===xa||n===_a)if(r=t.get("EXT_texture_compression_bptc"),r!==null){if(n===ga)return a===qt?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===xa)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===_a)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===va||n===ya||n===Rs||n===Ma)if(r=t.get("EXT_texture_compression_rgtc"),r!==null){if(n===va)return r.COMPRESSED_RED_RGTC1_EXT;if(n===ya)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===Rs)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===Ma)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===ki?i.UNSIGNED_INT_24_8:i[n]!==void 0?i[n]:null}return{convert:e}}var Ym=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Zm=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,rl=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,e){if(this.texture===null){let n=new us(t.texture);(t.depthNear!==e.depthNear||t.depthFar!==e.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=n}}getMesh(t){if(this.texture!==null&&this.mesh===null){let e=t.cameras[0].viewport,n=new Ge({vertexShader:Ym,fragmentShader:Zm,uniforms:{depthColor:{value:this.texture},depthWidth:{value:e.z},depthHeight:{value:e.w}}});this.mesh=new me(new fs(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},al=class extends dn{constructor(t,e){super();let n=this,s=null,r=1,a=null,o="local-floor",c=1,l=null,u=null,d=null,h=null,p=null,g=null,y=typeof XRWebGLBinding<"u",m=new rl,f={},w=e.getContextAttributes(),A=null,M=null,T=[],b=[],C=new Ut,_=null,E=new Ce;E.viewport=new se;let P=new Ce;P.viewport=new se;let I=[E,P],D=new Fr,W=null,X=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(Y){let et=T[Y];return et===void 0&&(et=new Li,T[Y]=et),et.getTargetRaySpace()},this.getControllerGrip=function(Y){let et=T[Y];return et===void 0&&(et=new Li,T[Y]=et),et.getGripSpace()},this.getHand=function(Y){let et=T[Y];return et===void 0&&(et=new Li,T[Y]=et),et.getHandSpace()};function R(Y){let et=b.indexOf(Y.inputSource);if(et===-1)return;let tt=T[et];tt!==void 0&&(tt.update(Y.inputSource,Y.frame,l||a),tt.dispatchEvent({type:Y.type,data:Y.inputSource}))}function B(){s.removeEventListener("select",R),s.removeEventListener("selectstart",R),s.removeEventListener("selectend",R),s.removeEventListener("squeeze",R),s.removeEventListener("squeezestart",R),s.removeEventListener("squeezeend",R),s.removeEventListener("end",B),s.removeEventListener("inputsourceschange",H);for(let Y=0;Y<T.length;Y++){let et=b[Y];et!==null&&(b[Y]=null,T[Y].disconnect(et))}W=null,X=null,m.reset();for(let Y in f)delete f[Y];t.setRenderTarget(A),p=null,h=null,d=null,s=null,M=null,Ot.stop(),n.isPresenting=!1,t.setPixelRatio(_),t.setSize(C.width,C.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(Y){r=Y,n.isPresenting===!0&&wt("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(Y){o=Y,n.isPresenting===!0&&wt("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return l||a},this.setReferenceSpace=function(Y){l=Y},this.getBaseLayer=function(){return h!==null?h:p},this.getBinding=function(){return d===null&&y&&(d=new XRWebGLBinding(s,e)),d},this.getFrame=function(){return g},this.getSession=function(){return s},this.setSession=async function(Y){if(s=Y,s!==null){if(A=t.getRenderTarget(),s.addEventListener("select",R),s.addEventListener("selectstart",R),s.addEventListener("selectend",R),s.addEventListener("squeeze",R),s.addEventListener("squeezestart",R),s.addEventListener("squeezeend",R),s.addEventListener("end",B),s.addEventListener("inputsourceschange",H),w.xrCompatible!==!0&&await e.makeXRCompatible(),_=t.getPixelRatio(),t.getSize(C),y&&"createProjectionLayer"in XRWebGLBinding.prototype){let tt=null,Rt=null,Lt=null;w.depth&&(Lt=w.stencil?e.DEPTH24_STENCIL8:e.DEPTH_COMPONENT24,tt=w.stencil?Xn:un,Rt=w.stencil?ki:sn);let Tt={colorFormat:e.RGBA8,depthFormat:Lt,scaleFactor:r};d=this.getBinding(),h=d.createProjectionLayer(Tt),s.updateRenderState({layers:[h]}),t.setPixelRatio(1),t.setSize(h.textureWidth,h.textureHeight,!1),M=new Ve(h.textureWidth,h.textureHeight,{format:$e,type:Ne,depthTexture:new wn(h.textureWidth,h.textureHeight,Rt,void 0,void 0,void 0,void 0,void 0,void 0,tt),stencilBuffer:w.stencil,colorSpace:t.outputColorSpace,samples:w.antialias?4:0,resolveDepthBuffer:h.ignoreDepthValues===!1,resolveStencilBuffer:h.ignoreDepthValues===!1})}else{let tt={antialias:w.antialias,alpha:!0,depth:w.depth,stencil:w.stencil,framebufferScaleFactor:r};p=new XRWebGLLayer(s,e,tt),s.updateRenderState({baseLayer:p}),t.setPixelRatio(1),t.setSize(p.framebufferWidth,p.framebufferHeight,!1),M=new Ve(p.framebufferWidth,p.framebufferHeight,{format:$e,type:Ne,colorSpace:t.outputColorSpace,stencilBuffer:w.stencil,resolveDepthBuffer:p.ignoreDepthValues===!1,resolveStencilBuffer:p.ignoreDepthValues===!1})}M.isXRRenderTarget=!0,this.setFoveation(c),l=null,a=await s.requestReferenceSpace(o),Ot.setContext(s),Ot.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return m.getDepthTexture()};function H(Y){for(let et=0;et<Y.removed.length;et++){let tt=Y.removed[et],Rt=b.indexOf(tt);Rt>=0&&(b[Rt]=null,T[Rt].disconnect(tt))}for(let et=0;et<Y.added.length;et++){let tt=Y.added[et],Rt=b.indexOf(tt);if(Rt===-1){for(let Tt=0;Tt<T.length;Tt++)if(Tt>=b.length){b.push(tt),Rt=Tt;break}else if(b[Tt]===null){b[Tt]=tt,Rt=Tt;break}if(Rt===-1)break}let Lt=T[Rt];Lt&&Lt.connect(tt)}}let $=new N,j=new N;function nt(Y,et,tt){$.setFromMatrixPosition(et.matrixWorld),j.setFromMatrixPosition(tt.matrixWorld);let Rt=$.distanceTo(j),Lt=et.projectionMatrix.elements,Tt=tt.projectionMatrix.elements,le=Lt[14]/(Lt[10]-1),Vt=Lt[14]/(Lt[10]+1),Jt=(Lt[9]+1)/Lt[5],Xt=(Lt[9]-1)/Lt[5],Ht=(Lt[8]-1)/Lt[0],de=(Tt[8]+1)/Tt[0],ge=le*Ht,ve=le*de,be=Rt/(-Ht+de),re=be*-Ht;if(et.matrixWorld.decompose(Y.position,Y.quaternion,Y.scale),Y.translateX(re),Y.translateZ(be),Y.matrixWorld.compose(Y.position,Y.quaternion,Y.scale),Y.matrixWorldInverse.copy(Y.matrixWorld).invert(),Lt[10]===-1)Y.projectionMatrix.copy(et.projectionMatrix),Y.projectionMatrixInverse.copy(et.projectionMatrixInverse);else{let fe=le+be,U=Vt+be,Le=ge-re,Yt=ve+(Rt-re),S=Jt*Vt/U*fe,x=Xt*Vt/U*fe;Y.projectionMatrix.makePerspective(Le,Yt,S,x,fe,U),Y.projectionMatrixInverse.copy(Y.projectionMatrix).invert()}}function ct(Y,et){et===null?Y.matrixWorld.copy(Y.matrix):Y.matrixWorld.multiplyMatrices(et.matrixWorld,Y.matrix),Y.matrixWorldInverse.copy(Y.matrixWorld).invert()}this.updateCamera=function(Y){if(s===null)return;let et=Y.near,tt=Y.far;m.texture!==null&&(m.depthNear>0&&(et=m.depthNear),m.depthFar>0&&(tt=m.depthFar)),D.near=P.near=E.near=et,D.far=P.far=E.far=tt,(W!==D.near||X!==D.far)&&(s.updateRenderState({depthNear:D.near,depthFar:D.far}),W=D.near,X=D.far),D.layers.mask=Y.layers.mask|6,E.layers.mask=D.layers.mask&-5,P.layers.mask=D.layers.mask&-3;let Rt=Y.parent,Lt=D.cameras;ct(D,Rt);for(let Tt=0;Tt<Lt.length;Tt++)ct(Lt[Tt],Rt);Lt.length===2?nt(D,E,P):D.projectionMatrix.copy(E.projectionMatrix),dt(Y,D,Rt)};function dt(Y,et,tt){tt===null?Y.matrix.copy(et.matrixWorld):(Y.matrix.copy(tt.matrixWorld),Y.matrix.invert(),Y.matrix.multiply(et.matrixWorld)),Y.matrix.decompose(Y.position,Y.quaternion,Y.scale),Y.updateMatrixWorld(!0),Y.projectionMatrix.copy(et.projectionMatrix),Y.projectionMatrixInverse.copy(et.projectionMatrixInverse),Y.isPerspectiveCamera&&(Y.fov=Ri*2*Math.atan(1/Y.projectionMatrix.elements[5]),Y.zoom=1)}this.getCamera=function(){return D},this.getFoveation=function(){if(!(h===null&&p===null))return c},this.setFoveation=function(Y){c=Y,h!==null&&(h.fixedFoveation=Y),p!==null&&p.fixedFoveation!==void 0&&(p.fixedFoveation=Y)},this.hasDepthSensing=function(){return m.texture!==null},this.getDepthSensingMesh=function(){return m.getMesh(D)},this.getCameraTexture=function(Y){return f[Y]};let zt=null;function $t(Y,et){if(u=et.getViewerPose(l||a),g=et,u!==null){let tt=u.views;p!==null&&(t.setRenderTargetFramebuffer(M,p.framebuffer),t.setRenderTarget(M));let Rt=!1;tt.length!==D.cameras.length&&(D.cameras.length=0,Rt=!0);for(let Vt=0;Vt<tt.length;Vt++){let Jt=tt[Vt],Xt=null;if(p!==null)Xt=p.getViewport(Jt);else{let de=d.getViewSubImage(h,Jt);Xt=de.viewport,Vt===0&&(t.setRenderTargetTextures(M,de.colorTexture,de.depthStencilTexture),t.setRenderTarget(M))}let Ht=I[Vt];Ht===void 0&&(Ht=new Ce,Ht.layers.enable(Vt),Ht.viewport=new se,I[Vt]=Ht),Ht.matrix.fromArray(Jt.transform.matrix),Ht.matrix.decompose(Ht.position,Ht.quaternion,Ht.scale),Ht.projectionMatrix.fromArray(Jt.projectionMatrix),Ht.projectionMatrixInverse.copy(Ht.projectionMatrix).invert(),Ht.viewport.set(Xt.x,Xt.y,Xt.width,Xt.height),Vt===0&&(D.matrix.copy(Ht.matrix),D.matrix.decompose(D.position,D.quaternion,D.scale)),Rt===!0&&D.cameras.push(Ht)}let Lt=s.enabledFeatures;if(Lt&&Lt.includes("depth-sensing")&&s.depthUsage=="gpu-optimized"&&y){d=n.getBinding();let Vt=d.getDepthInformation(tt[0]);Vt&&Vt.isValid&&Vt.texture&&m.init(Vt,s.renderState)}if(Lt&&Lt.includes("camera-access")&&y){t.state.unbindTexture(),d=n.getBinding();for(let Vt=0;Vt<tt.length;Vt++){let Jt=tt[Vt].camera;if(Jt){let Xt=f[Jt];Xt||(Xt=new us,f[Jt]=Xt);let Ht=d.getCameraImage(Jt);Xt.sourceTexture=Ht}}}}for(let tt=0;tt<T.length;tt++){let Rt=b[tt],Lt=T[tt];Rt!==null&&Lt!==void 0&&Lt.update(Rt,et,l||a)}zt&&zt(Y,et),et.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:et}),g=null}let Ot=new Jc;Ot.setAnimationLoop($t),this.setAnimationLoop=function(Y){zt=Y},this.dispose=function(){}}},$m=new ie,nh=new It;nh.set(-1,0,0,0,1,0,0,0,1);function Jm(i,t){function e(m,f){m.matrixAutoUpdate===!0&&m.updateMatrix(),f.value.copy(m.matrix)}function n(m,f){f.color.getRGB(m.fogColor.value,Go(i)),f.isFog?(m.fogNear.value=f.near,m.fogFar.value=f.far):f.isFogExp2&&(m.fogDensity.value=f.density)}function s(m,f,w,A,M){f.isNodeMaterial?f.uniformsNeedUpdate=!1:f.isMeshBasicMaterial?r(m,f):f.isMeshLambertMaterial?(r(m,f),f.envMap&&(m.envMapIntensity.value=f.envMapIntensity)):f.isMeshToonMaterial?(r(m,f),d(m,f)):f.isMeshPhongMaterial?(r(m,f),u(m,f),f.envMap&&(m.envMapIntensity.value=f.envMapIntensity)):f.isMeshStandardMaterial?(r(m,f),h(m,f),f.isMeshPhysicalMaterial&&p(m,f,M)):f.isMeshMatcapMaterial?(r(m,f),g(m,f)):f.isMeshDepthMaterial?r(m,f):f.isMeshDistanceMaterial?(r(m,f),y(m,f)):f.isMeshNormalMaterial?r(m,f):f.isLineBasicMaterial?(a(m,f),f.isLineDashedMaterial&&o(m,f)):f.isPointsMaterial?c(m,f,w,A):f.isSpriteMaterial?l(m,f):f.isShadowMaterial?(m.color.value.copy(f.color),m.opacity.value=f.opacity):f.isShaderMaterial&&(f.uniformsNeedUpdate=!1)}function r(m,f){m.opacity.value=f.opacity,f.color&&m.diffuse.value.copy(f.color),f.emissive&&m.emissive.value.copy(f.emissive).multiplyScalar(f.emissiveIntensity),f.map&&(m.map.value=f.map,e(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,e(f.alphaMap,m.alphaMapTransform)),f.bumpMap&&(m.bumpMap.value=f.bumpMap,e(f.bumpMap,m.bumpMapTransform),m.bumpScale.value=f.bumpScale,f.side===Ee&&(m.bumpScale.value*=-1)),f.normalMap&&(m.normalMap.value=f.normalMap,e(f.normalMap,m.normalMapTransform),m.normalScale.value.copy(f.normalScale),f.side===Ee&&m.normalScale.value.negate()),f.displacementMap&&(m.displacementMap.value=f.displacementMap,e(f.displacementMap,m.displacementMapTransform),m.displacementScale.value=f.displacementScale,m.displacementBias.value=f.displacementBias),f.emissiveMap&&(m.emissiveMap.value=f.emissiveMap,e(f.emissiveMap,m.emissiveMapTransform)),f.specularMap&&(m.specularMap.value=f.specularMap,e(f.specularMap,m.specularMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest);let w=t.get(f),A=w.envMap,M=w.envMapRotation;A&&(m.envMap.value=A,m.envMapRotation.value.setFromMatrix4($m.makeRotationFromEuler(M)).transpose(),A.isCubeTexture&&A.isRenderTargetTexture===!1&&m.envMapRotation.value.premultiply(nh),m.reflectivity.value=f.reflectivity,m.ior.value=f.ior,m.refractionRatio.value=f.refractionRatio),f.lightMap&&(m.lightMap.value=f.lightMap,m.lightMapIntensity.value=f.lightMapIntensity,e(f.lightMap,m.lightMapTransform)),f.aoMap&&(m.aoMap.value=f.aoMap,m.aoMapIntensity.value=f.aoMapIntensity,e(f.aoMap,m.aoMapTransform))}function a(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,f.map&&(m.map.value=f.map,e(f.map,m.mapTransform))}function o(m,f){m.dashSize.value=f.dashSize,m.totalSize.value=f.dashSize+f.gapSize,m.scale.value=f.scale}function c(m,f,w,A){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.size.value=f.size*w,m.scale.value=A*.5,f.map&&(m.map.value=f.map,e(f.map,m.uvTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,e(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function l(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.rotation.value=f.rotation,f.map&&(m.map.value=f.map,e(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,e(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function u(m,f){m.specular.value.copy(f.specular),m.shininess.value=Math.max(f.shininess,1e-4)}function d(m,f){f.gradientMap&&(m.gradientMap.value=f.gradientMap)}function h(m,f){m.metalness.value=f.metalness,f.metalnessMap&&(m.metalnessMap.value=f.metalnessMap,e(f.metalnessMap,m.metalnessMapTransform)),m.roughness.value=f.roughness,f.roughnessMap&&(m.roughnessMap.value=f.roughnessMap,e(f.roughnessMap,m.roughnessMapTransform)),f.envMap&&(m.envMapIntensity.value=f.envMapIntensity)}function p(m,f,w){m.ior.value=f.ior,f.sheen>0&&(m.sheenColor.value.copy(f.sheenColor).multiplyScalar(f.sheen),m.sheenRoughness.value=f.sheenRoughness,f.sheenColorMap&&(m.sheenColorMap.value=f.sheenColorMap,e(f.sheenColorMap,m.sheenColorMapTransform)),f.sheenRoughnessMap&&(m.sheenRoughnessMap.value=f.sheenRoughnessMap,e(f.sheenRoughnessMap,m.sheenRoughnessMapTransform))),f.clearcoat>0&&(m.clearcoat.value=f.clearcoat,m.clearcoatRoughness.value=f.clearcoatRoughness,f.clearcoatMap&&(m.clearcoatMap.value=f.clearcoatMap,e(f.clearcoatMap,m.clearcoatMapTransform)),f.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=f.clearcoatRoughnessMap,e(f.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),f.clearcoatNormalMap&&(m.clearcoatNormalMap.value=f.clearcoatNormalMap,e(f.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(f.clearcoatNormalScale),f.side===Ee&&m.clearcoatNormalScale.value.negate())),f.dispersion>0&&(m.dispersion.value=f.dispersion),f.iridescence>0&&(m.iridescence.value=f.iridescence,m.iridescenceIOR.value=f.iridescenceIOR,m.iridescenceThicknessMinimum.value=f.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=f.iridescenceThicknessRange[1],f.iridescenceMap&&(m.iridescenceMap.value=f.iridescenceMap,e(f.iridescenceMap,m.iridescenceMapTransform)),f.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=f.iridescenceThicknessMap,e(f.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),f.transmission>0&&(m.transmission.value=f.transmission,m.transmissionSamplerMap.value=w.texture,m.transmissionSamplerSize.value.set(w.width,w.height),f.transmissionMap&&(m.transmissionMap.value=f.transmissionMap,e(f.transmissionMap,m.transmissionMapTransform)),m.thickness.value=f.thickness,f.thicknessMap&&(m.thicknessMap.value=f.thicknessMap,e(f.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=f.attenuationDistance,m.attenuationColor.value.copy(f.attenuationColor)),f.anisotropy>0&&(m.anisotropyVector.value.set(f.anisotropy*Math.cos(f.anisotropyRotation),f.anisotropy*Math.sin(f.anisotropyRotation)),f.anisotropyMap&&(m.anisotropyMap.value=f.anisotropyMap,e(f.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=f.specularIntensity,m.specularColor.value.copy(f.specularColor),f.specularColorMap&&(m.specularColorMap.value=f.specularColorMap,e(f.specularColorMap,m.specularColorMapTransform)),f.specularIntensityMap&&(m.specularIntensityMap.value=f.specularIntensityMap,e(f.specularIntensityMap,m.specularIntensityMapTransform))}function g(m,f){f.matcap&&(m.matcap.value=f.matcap)}function y(m,f){let w=t.get(f).light;m.referencePosition.value.setFromMatrixPosition(w.matrixWorld),m.nearDistance.value=w.shadow.camera.near,m.farDistance.value=w.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:s}}function Km(i,t,e,n){let s={},r={},a=[],o=i.getParameter(i.MAX_UNIFORM_BUFFER_BINDINGS);function c(M,T){let b=T.program;n.uniformBlockBinding(M,b)}function l(M,T){let b=s[M.id];b===void 0&&(m(M),b=u(M),s[M.id]=b,M.addEventListener("dispose",w));let C=T.program;n.updateUBOMapping(M,C);let _=t.render.frame;r[M.id]!==_&&(h(M),r[M.id]=_)}function u(M){let T=d();M.__bindingPointIndex=T;let b=i.createBuffer(),C=M.__size,_=M.usage;return i.bindBuffer(i.UNIFORM_BUFFER,b),i.bufferData(i.UNIFORM_BUFFER,C,_),i.bindBuffer(i.UNIFORM_BUFFER,null),i.bindBufferBase(i.UNIFORM_BUFFER,T,b),b}function d(){for(let M=0;M<o;M++)if(a.indexOf(M)===-1)return a.push(M),M;return Ct("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function h(M){let T=s[M.id],b=M.uniforms,C=M.__cache;i.bindBuffer(i.UNIFORM_BUFFER,T);for(let _=0,E=b.length;_<E;_++){let P=b[_];if(Array.isArray(P))for(let I=0,D=P.length;I<D;I++)p(P[I],_,I,C);else p(P,_,0,C)}i.bindBuffer(i.UNIFORM_BUFFER,null)}function p(M,T,b,C){if(y(M,T,b,C)===!0){let _=M.__offset,E=M.value;if(Array.isArray(E)){let P=0;for(let I=0;I<E.length;I++){let D=E[I],W=f(D);g(D,M.__data,P),typeof D!="number"&&typeof D!="boolean"&&!D.isMatrix3&&!ArrayBuffer.isView(D)&&(P+=W.storage/Float32Array.BYTES_PER_ELEMENT)}}else g(E,M.__data,0);i.bufferSubData(i.UNIFORM_BUFFER,_,M.__data)}}function g(M,T,b){typeof M=="number"||typeof M=="boolean"?T[0]=M:M.isMatrix3?(T[0]=M.elements[0],T[1]=M.elements[1],T[2]=M.elements[2],T[3]=0,T[4]=M.elements[3],T[5]=M.elements[4],T[6]=M.elements[5],T[7]=0,T[8]=M.elements[6],T[9]=M.elements[7],T[10]=M.elements[8],T[11]=0):ArrayBuffer.isView(M)?T.set(new M.constructor(M.buffer,M.byteOffset,T.length)):M.toArray(T,b)}function y(M,T,b,C){let _=M.value,E=T+"_"+b;if(C[E]===void 0)return typeof _=="number"||typeof _=="boolean"?C[E]=_:ArrayBuffer.isView(_)?C[E]=_.slice():C[E]=_.clone(),!0;{let P=C[E];if(typeof _=="number"||typeof _=="boolean"){if(P!==_)return C[E]=_,!0}else{if(ArrayBuffer.isView(_))return!0;if(P.equals(_)===!1)return P.copy(_),!0}}return!1}function m(M){let T=M.uniforms,b=0,C=16;for(let E=0,P=T.length;E<P;E++){let I=Array.isArray(T[E])?T[E]:[T[E]];for(let D=0,W=I.length;D<W;D++){let X=I[D],R=Array.isArray(X.value)?X.value:[X.value];for(let B=0,H=R.length;B<H;B++){let $=R[B],j=f($),nt=b%C,ct=nt%j.boundary,dt=nt+ct;b+=ct,dt!==0&&C-dt<j.storage&&(b+=C-dt),X.__data=new Float32Array(j.storage/Float32Array.BYTES_PER_ELEMENT),X.__offset=b,b+=j.storage}}}let _=b%C;return _>0&&(b+=C-_),M.__size=b,M.__cache={},this}function f(M){let T={boundary:0,storage:0};return typeof M=="number"||typeof M=="boolean"?(T.boundary=4,T.storage=4):M.isVector2?(T.boundary=8,T.storage=8):M.isVector3||M.isColor?(T.boundary=16,T.storage=12):M.isVector4?(T.boundary=16,T.storage=16):M.isMatrix3?(T.boundary=48,T.storage=48):M.isMatrix4?(T.boundary=64,T.storage=64):M.isTexture?wt("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(M)?(T.boundary=16,T.storage=M.byteLength):wt("WebGLRenderer: Unsupported uniform value type.",M),T}function w(M){let T=M.target;T.removeEventListener("dispose",w);let b=a.indexOf(T.__bindingPointIndex);a.splice(b,1),i.deleteBuffer(s[T.id]),delete s[T.id],delete r[T.id]}function A(){for(let M in s)i.deleteBuffer(s[M]);a=[],s={},r={}}return{bind:c,update:l,dispose:A}}var Qm=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),mn=null;function jm(){return mn===null&&(mn=new yr(Qm,16,16,qn,pn),mn.name="DFG_LUT",mn.minFilter=Se,mn.magFilter=Se,mn.wrapS=hn,mn.wrapT=hn,mn.generateMipmaps=!1,mn.needsUpdate=!0),mn}var Ra=class{constructor(t={}){let{canvas:e=Mc(),context:n=null,depth:s=!0,stencil:r=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:c=!0,preserveDrawingBuffer:l=!1,powerPreference:u="default",failIfMajorPerformanceCaveat:d=!1,reversedDepthBuffer:h=!1,outputBufferType:p=Ne}=t;this.isWebGLRenderer=!0;let g;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");g=n.getContextAttributes().alpha}else g=a;let y=p,m=new Set([Xr,Wr,Hr]),f=new Set([Ne,sn,Vi,ki,kr,Gr]),w=new Uint32Array(4),A=new Int32Array(4),M=new N,T=null,b=null,C=[],_=[],E=null;this.domElement=e,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=nn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let P=this,I=!1,D=null,W=null,X=null,R=null;this._outputColorSpace=Be;let B=0,H=0,$=null,j=-1,nt=null,ct=new se,dt=new se,zt=null,$t=new Pt(0),Ot=0,Y=e.width,et=e.height,tt=1,Rt=null,Lt=null,Tt=new se(0,0,Y,et),le=new se(0,0,Y,et),Vt=!1,Jt=new Ni,Xt=!1,Ht=!1,de=new ie,ge=new N,ve=new se,be={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},re=!1;function fe(){return $===null?tt:1}let U=n;function Le(v,F){return e.getContext(v,F)}try{let v={alpha:!0,depth:s,stencil:r,antialias:o,premultipliedAlpha:c,preserveDrawingBuffer:l,powerPreference:u,failIfMajorPerformanceCaveat:d};if("setAttribute"in e&&e.setAttribute("data-engine",`three.js r${"185"}`),e.addEventListener("webglcontextlost",ae,!1),e.addEventListener("webglcontextrestored",jt,!1),e.addEventListener("webglcontextcreationerror",an,!1),U===null){let F="webgl2";if(U=Le(F,v),U===null)throw Le(F)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}}catch(v){throw Ct("WebGLRenderer: "+v.message),v}let Yt,S,x,O,k,q,it,rt,Z,K,at,Mt,ht,ot,Et,At,Dt,L,st,J,lt,mt,Q;function yt(){Yt=new ap(U),Yt.init(),lt=new qm(U,Yt),S=new Qf(U,Yt,t,lt),x=new Wm(U,Yt),S.reversedDepthBuffer&&h&&x.buffers.depth.setReversed(!0),W=U.createFramebuffer(),X=U.createFramebuffer(),R=U.createFramebuffer(),O=new cp(U),k=new Im,q=new Xm(U,Yt,x,k,S,lt,O),it=new rp(P),rt=new du(U),mt=new Jf(U,rt),Z=new op(U,rt,O,mt),K=new up(U,Z,rt,mt,O),L=new hp(U,S,q),Et=new jf(k),at=new Rm(P,it,Yt,S,mt,Et),Mt=new Jm(P,k),ht=new Lm,ot=new Bm(Yt),Dt=new $f(P,it,x,K,g,c),At=new Hm(P,K,S),Q=new Km(U,O,S,x),st=new Kf(U,Yt,O),J=new lp(U,Yt,O),O.programs=at.programs,P.capabilities=S,P.extensions=Yt,P.properties=k,P.renderLists=ht,P.shadowMap=At,P.state=x,P.info=O}yt(),y!==Ne&&(E=new fp(y,e.width,e.height,o,s,r));let _t=new al(P,U);this.xr=_t,this.getContext=function(){return U},this.getContextAttributes=function(){return U.getContextAttributes()},this.forceContextLoss=function(){let v=Yt.get("WEBGL_lose_context");v&&v.loseContext()},this.forceContextRestore=function(){let v=Yt.get("WEBGL_lose_context");v&&v.restoreContext()},this.getPixelRatio=function(){return tt},this.setPixelRatio=function(v){v!==void 0&&(tt=v,this.setSize(Y,et,!1))},this.getSize=function(v){return v.set(Y,et)},this.setSize=function(v,F,G=!0){if(_t.isPresenting){wt("WebGLRenderer: Can't change size while VR device is presenting.");return}Y=v,et=F,e.width=Math.floor(v*tt),e.height=Math.floor(F*tt),G===!0&&(e.style.width=v+"px",e.style.height=F+"px"),E!==null&&E.setSize(e.width,e.height),this.setViewport(0,0,v,F)},this.getDrawingBufferSize=function(v){return v.set(Y*tt,et*tt).floor()},this.setDrawingBufferSize=function(v,F,G){Y=v,et=F,tt=G,e.width=Math.floor(v*G),e.height=Math.floor(F*G),this.setViewport(0,0,v,F)},this.setEffects=function(v){if(y===Ne){Ct("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(v){for(let F=0;F<v.length;F++)if(v[F].isOutputPass===!0){wt("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}E.setEffects(v||[])},this.getCurrentViewport=function(v){return v.copy(ct)},this.getViewport=function(v){return v.copy(Tt)},this.setViewport=function(v,F,G,z){v.isVector4?Tt.set(v.x,v.y,v.z,v.w):Tt.set(v,F,G,z),x.viewport(ct.copy(Tt).multiplyScalar(tt).round())},this.getScissor=function(v){return v.copy(le)},this.setScissor=function(v,F,G,z){v.isVector4?le.set(v.x,v.y,v.z,v.w):le.set(v,F,G,z),x.scissor(dt.copy(le).multiplyScalar(tt).round())},this.getScissorTest=function(){return Vt},this.setScissorTest=function(v){x.setScissorTest(Vt=v)},this.setOpaqueSort=function(v){Rt=v},this.setTransparentSort=function(v){Lt=v},this.getClearColor=function(v){return v.copy(Dt.getClearColor())},this.setClearColor=function(){Dt.setClearColor(...arguments)},this.getClearAlpha=function(){return Dt.getClearAlpha()},this.setClearAlpha=function(){Dt.setClearAlpha(...arguments)},this.clear=function(v=!0,F=!0,G=!0){let z=0;if(v){let V=!1;if($!==null){let pt=$.texture.format;V=m.has(pt)}if(V){let pt=$.texture.type,xt=f.has(pt),ft=Dt.getClearColor(),vt=Dt.getClearAlpha(),bt=ft.r,Nt=ft.g,Bt=ft.b;xt?(w[0]=bt,w[1]=Nt,w[2]=Bt,w[3]=vt,U.clearBufferuiv(U.COLOR,0,w)):(A[0]=bt,A[1]=Nt,A[2]=Bt,A[3]=vt,U.clearBufferiv(U.COLOR,0,A))}else z|=U.COLOR_BUFFER_BIT}F&&(z|=U.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),G&&(z|=U.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),z!==0&&U.clear(z)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(v){v.setRenderer(this),D=v},this.dispose=function(){e.removeEventListener("webglcontextlost",ae,!1),e.removeEventListener("webglcontextrestored",jt,!1),e.removeEventListener("webglcontextcreationerror",an,!1),Dt.dispose(),ht.dispose(),ot.dispose(),k.dispose(),it.dispose(),K.dispose(),mt.dispose(),Q.dispose(),at.dispose(),_t.dispose(),_t.removeEventListener("sessionstart",dl),_t.removeEventListener("sessionend",fl),Zn.stop()};function ae(v){v.preventDefault(),Vo("WebGLRenderer: Context Lost."),I=!0}function jt(){Vo("WebGLRenderer: Context Restored."),I=!1;let v=O.autoReset,F=At.enabled,G=At.autoUpdate,z=At.needsUpdate,V=At.type;yt(),O.autoReset=v,At.enabled=F,At.autoUpdate=G,At.needsUpdate=z,At.type=V}function an(v){Ct("WebGLRenderer: A WebGL context could not be created. Reason: ",v.statusMessage)}function on(v){let F=v.target;F.removeEventListener("dispose",on),hh(F)}function hh(v){uh(v),k.remove(v)}function uh(v){let F=k.get(v).programs;F!==void 0&&(F.forEach(function(G){at.releaseProgram(G)}),v.isShaderMaterial&&at.releaseShaderCache(v))}this.renderBufferDirect=function(v,F,G,z,V,pt){F===null&&(F=be);let xt=V.isMesh&&V.matrixWorld.determinantAffine()<0,ft=ph(v,F,G,z,V);x.setMaterial(z,xt);let vt=G.index,bt=1;if(z.wireframe===!0){if(vt=Z.getWireframeAttribute(G),vt===void 0)return;bt=2}let Nt=G.drawRange,Bt=G.attributes.position,St=Nt.start*bt,Zt=(Nt.start+Nt.count)*bt;pt!==null&&(St=Math.max(St,pt.start*bt),Zt=Math.min(Zt,(pt.start+pt.count)*bt)),vt!==null?(St=Math.max(St,0),Zt=Math.min(Zt,vt.count)):Bt!=null&&(St=Math.max(St,0),Zt=Math.min(Zt,Bt.count));let ce=Zt-St;if(ce<0||ce===1/0)return;mt.setup(V,z,ft,G,vt);let oe,Kt=st;if(vt!==null&&(oe=rt.get(vt),Kt=J,Kt.setIndex(oe)),V.isMesh)z.wireframe===!0?(x.setLineWidth(z.wireframeLinewidth*fe()),Kt.setMode(U.LINES)):Kt.setMode(U.TRIANGLES);else if(V.isLine){let we=z.linewidth;we===void 0&&(we=1),x.setLineWidth(we*fe()),V.isLineSegments?Kt.setMode(U.LINES):V.isLineLoop?Kt.setMode(U.LINE_LOOP):Kt.setMode(U.LINE_STRIP)}else V.isPoints?Kt.setMode(U.POINTS):V.isSprite&&Kt.setMode(U.TRIANGLES);if(V.isBatchedMesh)if(Yt.get("WEBGL_multi_draw"))Kt.renderMultiDraw(V._multiDrawStarts,V._multiDrawCounts,V._multiDrawCount);else{let we=V._multiDrawStarts,gt=V._multiDrawCounts,Ue=V._multiDrawCount,Wt=vt?rt.get(vt).bytesPerElement:1,We=k.get(z).currentProgram.getUniforms();for(let ln=0;ln<Ue;ln++)We.setValue(U,"_gl_DrawID",ln),Kt.render(we[ln]/Wt,gt[ln])}else if(V.isInstancedMesh)Kt.renderInstances(St,ce,V.count);else if(G.isInstancedBufferGeometry){let we=G._maxInstanceCount!==void 0?G._maxInstanceCount:1/0,gt=Math.min(G.instanceCount,we);Kt.renderInstances(St,ce,gt)}else Kt.render(St,ce)};function ul(v,F,G){v.transparent===!0&&v.side===Ze&&v.forceSinglePass===!1?(v.side=Ee,v.needsUpdate=!0,Os(v,F,G),v.side=Sn,v.needsUpdate=!0,Os(v,F,G),v.side=Ze):Os(v,F,G)}this.compile=function(v,F,G=null){G===null&&(G=v),b=ot.get(G),b.init(F),_.push(b),G.traverseVisible(function(V){V.isLight&&V.layers.test(F.layers)&&(b.pushLight(V),V.castShadow&&b.pushShadow(V))}),v!==G&&v.traverseVisible(function(V){V.isLight&&V.layers.test(F.layers)&&(b.pushLight(V),V.castShadow&&b.pushShadow(V))}),b.setupLights();let z=new Set;return v.traverse(function(V){if(!(V.isMesh||V.isPoints||V.isLine||V.isSprite))return;let pt=V.material;if(pt)if(Array.isArray(pt))for(let xt=0;xt<pt.length;xt++){let ft=pt[xt];ul(ft,G,V),z.add(ft)}else ul(pt,G,V),z.add(pt)}),b=_.pop(),z},this.compileAsync=function(v,F,G=null){let z=this.compile(v,F,G);return new Promise(V=>{function pt(){if(z.forEach(function(xt){k.get(xt).currentProgram.isReady()&&z.delete(xt)}),z.size===0){V(v);return}setTimeout(pt,10)}Yt.get("KHR_parallel_shader_compile")!==null?pt():setTimeout(pt,10)})};let Na=null;function dh(v){Na&&Na(v)}function dl(){Zn.stop()}function fl(){Zn.start()}let Zn=new Jc;Zn.setAnimationLoop(dh),typeof self<"u"&&Zn.setContext(self),this.setAnimationLoop=function(v){Na=v,_t.setAnimationLoop(v),v===null?Zn.stop():Zn.start()},_t.addEventListener("sessionstart",dl),_t.addEventListener("sessionend",fl),this.render=function(v,F){if(F!==void 0&&F.isCamera!==!0){Ct("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(I===!0)return;D!==null&&D.renderStart(v,F);let G=_t.enabled===!0&&_t.isPresenting===!0,z=E!==null&&($===null||G)&&E.begin(P,$);if(v.matrixWorldAutoUpdate===!0&&v.updateMatrixWorld(),F.parent===null&&F.matrixWorldAutoUpdate===!0&&F.updateMatrixWorld(),_t.enabled===!0&&_t.isPresenting===!0&&(E===null||E.isCompositing()===!1)&&(_t.cameraAutoUpdate===!0&&_t.updateCamera(F),F=_t.getCamera()),v.isScene===!0&&v.onBeforeRender(P,v,F,$),b=ot.get(v,_.length),b.init(F),b.state.textureUnits=q.getTextureUnits(),_.push(b),de.multiplyMatrices(F.projectionMatrix,F.matrixWorldInverse),Jt.setFromProjectionMatrix(de,je,F.reversedDepth),Ht=this.localClippingEnabled,Xt=Et.init(this.clippingPlanes,Ht),T=ht.get(v,C.length),T.init(),C.push(T),_t.enabled===!0&&_t.isPresenting===!0){let xt=P.xr.getDepthSensingMesh();xt!==null&&Ua(xt,F,-1/0,P.sortObjects)}Ua(v,F,0,P.sortObjects),T.finish(),P.sortObjects===!0&&T.sort(Rt,Lt,F.reversedDepth),re=_t.enabled===!1||_t.isPresenting===!1||_t.hasDepthSensing()===!1,re&&Dt.addToRenderList(T,v),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),Xt===!0&&Et.beginShadows();let V=b.state.shadowsArray;if(At.render(V,v,F),Xt===!0&&Et.endShadows(),(z&&E.hasRenderPass())===!1){let xt=T.opaque,ft=T.transmissive;if(b.setupLights(),F.isArrayCamera){let vt=F.cameras;if(ft.length>0)for(let bt=0,Nt=vt.length;bt<Nt;bt++){let Bt=vt[bt];ml(xt,ft,v,Bt)}re&&Dt.render(v);for(let bt=0,Nt=vt.length;bt<Nt;bt++){let Bt=vt[bt];pl(T,v,Bt,Bt.viewport)}}else ft.length>0&&ml(xt,ft,v,F),re&&Dt.render(v),pl(T,v,F)}$!==null&&H===0&&(q.updateMultisampleRenderTarget($),q.updateRenderTargetMipmap($)),z&&E.end(P),v.isScene===!0&&v.onAfterRender(P,v,F),mt.resetDefaultState(),j=-1,nt=null,_.pop(),_.length>0?(b=_[_.length-1],q.setTextureUnits(b.state.textureUnits),Xt===!0&&Et.setGlobalState(P.clippingPlanes,b.state.camera)):b=null,C.pop(),C.length>0?T=C[C.length-1]:T=null,D!==null&&D.renderEnd()};function Ua(v,F,G,z){if(v.visible===!1)return;if(v.layers.test(F.layers)){if(v.isGroup)G=v.renderOrder;else if(v.isLOD)v.autoUpdate===!0&&v.update(F);else if(v.isLightProbeGrid)b.pushLightProbeGrid(v);else if(v.isLight)b.pushLight(v),v.castShadow&&b.pushShadow(v);else if(v.isSprite){if(!v.frustumCulled||Jt.intersectsSprite(v)){z&&ve.setFromMatrixPosition(v.matrixWorld).applyMatrix4(de);let xt=K.update(v),ft=v.material;ft.visible&&T.push(v,xt,ft,G,ve.z,null)}}else if((v.isMesh||v.isLine||v.isPoints)&&(!v.frustumCulled||Jt.intersectsObject(v))){let xt=K.update(v),ft=v.material;if(z&&(v.boundingSphere!==void 0?(v.boundingSphere===null&&v.computeBoundingSphere(),ve.copy(v.boundingSphere.center)):(xt.boundingSphere===null&&xt.computeBoundingSphere(),ve.copy(xt.boundingSphere.center)),ve.applyMatrix4(v.matrixWorld).applyMatrix4(de)),Array.isArray(ft)){let vt=xt.groups;for(let bt=0,Nt=vt.length;bt<Nt;bt++){let Bt=vt[bt],St=ft[Bt.materialIndex];St&&St.visible&&T.push(v,xt,St,G,ve.z,Bt)}}else ft.visible&&T.push(v,xt,ft,G,ve.z,null)}}let pt=v.children;for(let xt=0,ft=pt.length;xt<ft;xt++)Ua(pt[xt],F,G,z)}function pl(v,F,G,z){let{opaque:V,transmissive:pt,transparent:xt}=v;b.setupLightsView(G),Xt===!0&&Et.setGlobalState(P.clippingPlanes,G),z&&x.viewport(ct.copy(z)),V.length>0&&Fs(V,F,G),pt.length>0&&Fs(pt,F,G),xt.length>0&&Fs(xt,F,G),x.buffers.depth.setTest(!0),x.buffers.depth.setMask(!0),x.buffers.color.setMask(!0),x.setPolygonOffset(!1)}function ml(v,F,G,z){if((G.isScene===!0?G.overrideMaterial:null)!==null)return;if(b.state.transmissionRenderTarget[z.id]===void 0){let St=Yt.has("EXT_color_buffer_half_float")||Yt.has("EXT_color_buffer_float");b.state.transmissionRenderTarget[z.id]=new Ve(1,1,{generateMipmaps:!0,type:St?pn:Ne,minFilter:Wn,samples:Math.max(4,S.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:kt.workingColorSpace})}let pt=b.state.transmissionRenderTarget[z.id],xt=z.viewport||ct;pt.setSize(xt.z*P.transmissionResolutionScale,xt.w*P.transmissionResolutionScale);let ft=P.getRenderTarget(),vt=P.getActiveCubeFace(),bt=P.getActiveMipmapLevel();P.setRenderTarget(pt),P.getClearColor($t),Ot=P.getClearAlpha(),Ot<1&&P.setClearColor(16777215,.5),P.clear(),re&&Dt.render(G);let Nt=P.toneMapping;P.toneMapping=nn;let Bt=z.viewport;if(z.viewport!==void 0&&(z.viewport=void 0),b.setupLightsView(z),Xt===!0&&Et.setGlobalState(P.clippingPlanes,z),Fs(v,G,z),q.updateMultisampleRenderTarget(pt),q.updateRenderTargetMipmap(pt),Yt.has("WEBGL_multisampled_render_to_texture")===!1){let St=!1;for(let Zt=0,ce=F.length;Zt<ce;Zt++){let oe=F[Zt],{object:Kt,geometry:we,material:gt,group:Ue}=oe;if(gt.side===Ze&&Kt.layers.test(z.layers)){let Wt=gt.side;gt.side=Ee,gt.needsUpdate=!0,gl(Kt,G,z,we,gt,Ue),gt.side=Wt,gt.needsUpdate=!0,St=!0}}St===!0&&(q.updateMultisampleRenderTarget(pt),q.updateRenderTargetMipmap(pt))}P.setRenderTarget(ft,vt,bt),P.setClearColor($t,Ot),Bt!==void 0&&(z.viewport=Bt),P.toneMapping=Nt}function Fs(v,F,G){let z=F.isScene===!0?F.overrideMaterial:null;for(let V=0,pt=v.length;V<pt;V++){let xt=v[V],{object:ft,geometry:vt,group:bt}=xt,Nt=xt.material;Nt.allowOverride===!0&&z!==null&&(Nt=z),ft.layers.test(G.layers)&&gl(ft,F,G,vt,Nt,bt)}}function gl(v,F,G,z,V,pt){v.onBeforeRender(P,F,G,z,V,pt),v.modelViewMatrix.multiplyMatrices(G.matrixWorldInverse,v.matrixWorld),v.normalMatrix.getNormalMatrix(v.modelViewMatrix),V.onBeforeRender(P,F,G,z,v,pt),V.transparent===!0&&V.side===Ze&&V.forceSinglePass===!1?(V.side=Ee,V.needsUpdate=!0,P.renderBufferDirect(G,F,z,V,v,pt),V.side=Sn,V.needsUpdate=!0,P.renderBufferDirect(G,F,z,V,v,pt),V.side=Ze):P.renderBufferDirect(G,F,z,V,v,pt),v.onAfterRender(P,F,G,z,V,pt)}function Os(v,F,G){F.isScene!==!0&&(F=be);let z=k.get(v),V=b.state.lights,pt=b.state.shadowsArray,xt=V.state.version,ft=at.getParameters(v,V.state,pt,F,G,b.state.lightProbeGridArray),vt=at.getProgramCacheKey(ft),bt=z.programs;z.environment=v.isMeshStandardMaterial||v.isMeshLambertMaterial||v.isMeshPhongMaterial?F.environment:null,z.fog=F.fog;let Nt=v.isMeshStandardMaterial||v.isMeshLambertMaterial&&!v.envMap||v.isMeshPhongMaterial&&!v.envMap;z.envMap=it.get(v.envMap||z.environment,Nt),z.envMapRotation=z.environment!==null&&v.envMap===null?F.environmentRotation:v.envMapRotation,bt===void 0&&(v.addEventListener("dispose",on),bt=new Map,z.programs=bt);let Bt=bt.get(vt);if(Bt!==void 0){if(z.currentProgram===Bt&&z.lightsStateVersion===xt)return _l(v,ft),Bt}else ft.uniforms=at.getUniforms(v),D!==null&&v.isNodeMaterial&&D.build(v,G,ft),v.onBeforeCompile(ft,P),Bt=at.acquireProgram(ft,vt),bt.set(vt,Bt),z.uniforms=ft.uniforms;let St=z.uniforms;return(!v.isShaderMaterial&&!v.isRawShaderMaterial||v.clipping===!0)&&(St.clippingPlanes=Et.uniform),_l(v,ft),z.needsLights=gh(v),z.lightsStateVersion=xt,z.needsLights&&(St.ambientLightColor.value=V.state.ambient,St.lightProbe.value=V.state.probe,St.directionalLights.value=V.state.directional,St.directionalLightShadows.value=V.state.directionalShadow,St.spotLights.value=V.state.spot,St.spotLightShadows.value=V.state.spotShadow,St.rectAreaLights.value=V.state.rectArea,St.ltc_1.value=V.state.rectAreaLTC1,St.ltc_2.value=V.state.rectAreaLTC2,St.pointLights.value=V.state.point,St.pointLightShadows.value=V.state.pointShadow,St.hemisphereLights.value=V.state.hemi,St.directionalShadowMatrix.value=V.state.directionalShadowMatrix,St.spotLightMatrix.value=V.state.spotLightMatrix,St.spotLightMap.value=V.state.spotLightMap,St.pointShadowMatrix.value=V.state.pointShadowMatrix),z.lightProbeGrid=b.state.lightProbeGridArray.length>0,z.currentProgram=Bt,z.uniformsList=null,Bt}function xl(v){if(v.uniformsList===null){let F=v.currentProgram.getUniforms();v.uniformsList=Wi.seqWithValue(F.seq,v.uniforms)}return v.uniformsList}function _l(v,F){let G=k.get(v);G.outputColorSpace=F.outputColorSpace,G.batching=F.batching,G.batchingColor=F.batchingColor,G.instancing=F.instancing,G.instancingColor=F.instancingColor,G.instancingMorph=F.instancingMorph,G.skinning=F.skinning,G.morphTargets=F.morphTargets,G.morphNormals=F.morphNormals,G.morphColors=F.morphColors,G.morphTargetsCount=F.morphTargetsCount,G.numClippingPlanes=F.numClippingPlanes,G.numIntersection=F.numClipIntersection,G.vertexAlphas=F.vertexAlphas,G.vertexTangents=F.vertexTangents,G.toneMapping=F.toneMapping}function fh(v,F){if(v.length===0)return null;if(v.length===1)return v[0].texture!==null?v[0]:null;M.setFromMatrixPosition(F.matrixWorld);for(let G=0,z=v.length;G<z;G++){let V=v[G];if(V.texture!==null&&V.boundingBox.containsPoint(M))return V}return null}function ph(v,F,G,z,V){F.isScene!==!0&&(F=be),q.resetTextureUnits();let pt=F.fog,xt=z.isMeshStandardMaterial||z.isMeshLambertMaterial||z.isMeshPhongMaterial?F.environment:null,ft=$===null?P.outputColorSpace:$.isXRRenderTarget===!0?$.texture.colorSpace:kt.workingColorSpace,vt=z.isMeshStandardMaterial||z.isMeshLambertMaterial&&!z.envMap||z.isMeshPhongMaterial&&!z.envMap,bt=it.get(z.envMap||xt,vt),Nt=z.vertexColors===!0&&!!G.attributes.color&&G.attributes.color.itemSize===4,Bt=!!G.attributes.tangent&&(!!z.normalMap||z.anisotropy>0),St=!!G.morphAttributes.position,Zt=!!G.morphAttributes.normal,ce=!!G.morphAttributes.color,oe=nn;z.toneMapped&&($===null||$.isXRRenderTarget===!0)&&(oe=P.toneMapping);let Kt=G.morphAttributes.position||G.morphAttributes.normal||G.morphAttributes.color,we=Kt!==void 0?Kt.length:0,gt=k.get(z),Ue=b.state.lights;if(Xt===!0&&(Ht===!0||v!==nt)){let te=v===nt&&z.id===j;Et.setState(z,v,te)}let Wt=!1;z.version===gt.__version?(gt.needsLights&&gt.lightsStateVersion!==Ue.state.version||gt.outputColorSpace!==ft||V.isBatchedMesh&&gt.batching===!1||!V.isBatchedMesh&&gt.batching===!0||V.isBatchedMesh&&gt.batchingColor===!0&&V.colorTexture===null||V.isBatchedMesh&&gt.batchingColor===!1&&V.colorTexture!==null||V.isInstancedMesh&&gt.instancing===!1||!V.isInstancedMesh&&gt.instancing===!0||V.isSkinnedMesh&&gt.skinning===!1||!V.isSkinnedMesh&&gt.skinning===!0||V.isInstancedMesh&&gt.instancingColor===!0&&V.instanceColor===null||V.isInstancedMesh&&gt.instancingColor===!1&&V.instanceColor!==null||V.isInstancedMesh&&gt.instancingMorph===!0&&V.morphTexture===null||V.isInstancedMesh&&gt.instancingMorph===!1&&V.morphTexture!==null||gt.envMap!==bt||z.fog===!0&&gt.fog!==pt||gt.numClippingPlanes!==void 0&&(gt.numClippingPlanes!==Et.numPlanes||gt.numIntersection!==Et.numIntersection)||gt.vertexAlphas!==Nt||gt.vertexTangents!==Bt||gt.morphTargets!==St||gt.morphNormals!==Zt||gt.morphColors!==ce||gt.toneMapping!==oe||gt.morphTargetsCount!==we||!!gt.lightProbeGrid!=b.state.lightProbeGridArray.length>0)&&(Wt=!0):(Wt=!0,gt.__version=z.version);let We=gt.currentProgram;Wt===!0&&(We=Os(z,F,V),D&&z.isNodeMaterial&&D.onUpdateProgram(z,We,gt));let ln=!1,An=!1,ui=!1,Qt=We.getUniforms(),he=gt.uniforms;if(x.useProgram(We.program)&&(ln=!0,An=!0,ui=!0),z.id!==j&&(j=z.id,An=!0),gt.needsLights){let te=fh(b.state.lightProbeGridArray,V);gt.lightProbeGrid!==te&&(gt.lightProbeGrid=te,An=!0)}if(ln||nt!==v){x.buffers.depth.getReversed()&&v.reversedDepth!==!0&&(v._reversedDepth=!0,v.updateProjectionMatrix()),Qt.setValue(U,"projectionMatrix",v.projectionMatrix),Qt.setValue(U,"viewMatrix",v.matrixWorldInverse);let Rn=Qt.map.cameraPosition;Rn!==void 0&&Rn.setValue(U,ge.setFromMatrixPosition(v.matrixWorld)),S.logarithmicDepthBuffer&&Qt.setValue(U,"logDepthBufFC",2/(Math.log(v.far+1)/Math.LN2)),(z.isMeshPhongMaterial||z.isMeshToonMaterial||z.isMeshLambertMaterial||z.isMeshBasicMaterial||z.isMeshStandardMaterial||z.isShaderMaterial)&&Qt.setValue(U,"isOrthographic",v.isOrthographicCamera===!0),nt!==v&&(nt=v,An=!0,ui=!0)}if(gt.needsLights&&(Ue.state.directionalShadowMap.length>0&&Qt.setValue(U,"directionalShadowMap",Ue.state.directionalShadowMap,q),Ue.state.spotShadowMap.length>0&&Qt.setValue(U,"spotShadowMap",Ue.state.spotShadowMap,q),Ue.state.pointShadowMap.length>0&&Qt.setValue(U,"pointShadowMap",Ue.state.pointShadowMap,q)),V.isSkinnedMesh){Qt.setOptional(U,V,"bindMatrix"),Qt.setOptional(U,V,"bindMatrixInverse");let te=V.skeleton;te&&(te.boneTexture===null&&te.computeBoneTexture(),Qt.setValue(U,"boneTexture",te.boneTexture,q))}V.isBatchedMesh&&(Qt.setOptional(U,V,"batchingTexture"),Qt.setValue(U,"batchingTexture",V._matricesTexture,q),Qt.setOptional(U,V,"batchingIdTexture"),Qt.setValue(U,"batchingIdTexture",V._indirectTexture,q),Qt.setOptional(U,V,"batchingColorTexture"),V._colorsTexture!==null&&Qt.setValue(U,"batchingColorTexture",V._colorsTexture,q));let Cn=G.morphAttributes;if((Cn.position!==void 0||Cn.normal!==void 0||Cn.color!==void 0)&&L.update(V,G,We),(An||gt.receiveShadow!==V.receiveShadow)&&(gt.receiveShadow=V.receiveShadow,Qt.setValue(U,"receiveShadow",V.receiveShadow)),(z.isMeshStandardMaterial||z.isMeshLambertMaterial||z.isMeshPhongMaterial)&&z.envMap===null&&F.environment!==null&&(he.envMapIntensity.value=F.environmentIntensity),he.dfgLUT!==void 0&&(he.dfgLUT.value=jm()),An){if(Qt.setValue(U,"toneMappingExposure",P.toneMappingExposure),gt.needsLights&&mh(he,ui),pt&&z.fog===!0&&Mt.refreshFogUniforms(he,pt),Mt.refreshMaterialUniforms(he,z,tt,et,b.state.transmissionRenderTarget[v.id]),gt.needsLights&&gt.lightProbeGrid){let te=gt.lightProbeGrid;he.probesSH.value=te.texture,he.probesMin.value.copy(te.boundingBox.min),he.probesMax.value.copy(te.boundingBox.max),he.probesResolution.value.copy(te.resolution)}Wi.upload(U,xl(gt),he,q)}if(z.isShaderMaterial&&z.uniformsNeedUpdate===!0&&(Wi.upload(U,xl(gt),he,q),z.uniformsNeedUpdate=!1),z.isSpriteMaterial&&Qt.setValue(U,"center",V.center),Qt.setValue(U,"modelViewMatrix",V.modelViewMatrix),Qt.setValue(U,"normalMatrix",V.normalMatrix),Qt.setValue(U,"modelMatrix",V.matrixWorld),z.uniformsGroups!==void 0){let te=z.uniformsGroups;for(let Rn=0,di=te.length;Rn<di;Rn++){let vl=te[Rn];Q.update(vl,We),Q.bind(vl,We)}}return We}function mh(v,F){v.ambientLightColor.needsUpdate=F,v.lightProbe.needsUpdate=F,v.directionalLights.needsUpdate=F,v.directionalLightShadows.needsUpdate=F,v.pointLights.needsUpdate=F,v.pointLightShadows.needsUpdate=F,v.spotLights.needsUpdate=F,v.spotLightShadows.needsUpdate=F,v.rectAreaLights.needsUpdate=F,v.hemisphereLights.needsUpdate=F}function gh(v){return v.isMeshLambertMaterial||v.isMeshToonMaterial||v.isMeshPhongMaterial||v.isMeshStandardMaterial||v.isShadowMaterial||v.isShaderMaterial&&v.lights===!0}this.getActiveCubeFace=function(){return B},this.getActiveMipmapLevel=function(){return H},this.getRenderTarget=function(){return $},this.setRenderTargetTextures=function(v,F,G){let z=k.get(v);z.__autoAllocateDepthBuffer=v.resolveDepthBuffer===!1,z.__autoAllocateDepthBuffer===!1&&(z.__useRenderToTexture=!1),k.get(v.texture).__webglTexture=F,k.get(v.depthTexture).__webglTexture=z.__autoAllocateDepthBuffer?void 0:G,z.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(v,F){let G=k.get(v);G.__webglFramebuffer=F,G.__useDefaultFramebuffer=F===void 0},this.setRenderTarget=function(v,F=0,G=0){$=v,B=F,H=G;let z=null,V=!1,pt=!1;if(v){let ft=k.get(v);if(ft.__useDefaultFramebuffer!==void 0){x.bindFramebuffer(U.FRAMEBUFFER,ft.__webglFramebuffer),ct.copy(v.viewport),dt.copy(v.scissor),zt=v.scissorTest,x.viewport(ct),x.scissor(dt),x.setScissorTest(zt),j=-1;return}else if(ft.__webglFramebuffer===void 0)q.setupRenderTarget(v);else if(ft.__hasExternalTextures)q.rebindTextures(v,k.get(v.texture).__webglTexture,k.get(v.depthTexture).__webglTexture);else if(v.depthBuffer){let Nt=v.depthTexture;if(ft.__boundDepthTexture!==Nt){if(Nt!==null&&k.has(Nt)&&(v.width!==Nt.image.width||v.height!==Nt.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");q.setupDepthRenderbuffer(v)}}let vt=v.texture;(vt.isData3DTexture||vt.isDataArrayTexture||vt.isCompressedArrayTexture)&&(pt=!0);let bt=k.get(v).__webglFramebuffer;v.isWebGLCubeRenderTarget?(Array.isArray(bt[F])?z=bt[F][G]:z=bt[F],V=!0):v.samples>0&&q.useMultisampledRTT(v)===!1?z=k.get(v).__webglMultisampledFramebuffer:Array.isArray(bt)?z=bt[G]:z=bt,ct.copy(v.viewport),dt.copy(v.scissor),zt=v.scissorTest}else ct.copy(Tt).multiplyScalar(tt).floor(),dt.copy(le).multiplyScalar(tt).floor(),zt=Vt;if(G!==0&&(z=W),x.bindFramebuffer(U.FRAMEBUFFER,z)&&x.drawBuffers(v,z),x.viewport(ct),x.scissor(dt),x.setScissorTest(zt),V){let ft=k.get(v.texture);U.framebufferTexture2D(U.FRAMEBUFFER,U.COLOR_ATTACHMENT0,U.TEXTURE_CUBE_MAP_POSITIVE_X+F,ft.__webglTexture,G)}else if(pt){let ft=F;for(let vt=0;vt<v.textures.length;vt++){let bt=k.get(v.textures[vt]);U.framebufferTextureLayer(U.FRAMEBUFFER,U.COLOR_ATTACHMENT0+vt,bt.__webglTexture,G,ft)}}else if(v!==null&&G!==0){let ft=k.get(v.texture);U.framebufferTexture2D(U.FRAMEBUFFER,U.COLOR_ATTACHMENT0,U.TEXTURE_2D,ft.__webglTexture,G)}j=-1},this.readRenderTargetPixels=function(v,F,G,z,V,pt,xt,ft=0){if(!(v&&v.isWebGLRenderTarget)){Ct("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let vt=k.get(v).__webglFramebuffer;if(v.isWebGLCubeRenderTarget&&xt!==void 0&&(vt=vt[xt]),vt){x.bindFramebuffer(U.FRAMEBUFFER,vt);try{let bt=v.textures[ft],Nt=bt.format,Bt=bt.type;if(v.textures.length>1&&U.readBuffer(U.COLOR_ATTACHMENT0+ft),!S.textureFormatReadable(Nt)){Ct("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!S.textureTypeReadable(Bt)){Ct("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}F>=0&&F<=v.width-z&&G>=0&&G<=v.height-V&&U.readPixels(F,G,z,V,lt.convert(Nt),lt.convert(Bt),pt)}finally{let bt=$!==null?k.get($).__webglFramebuffer:null;x.bindFramebuffer(U.FRAMEBUFFER,bt)}}},this.readRenderTargetPixelsAsync=async function(v,F,G,z,V,pt,xt,ft=0){if(!(v&&v.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let vt=k.get(v).__webglFramebuffer;if(v.isWebGLCubeRenderTarget&&xt!==void 0&&(vt=vt[xt]),vt)if(F>=0&&F<=v.width-z&&G>=0&&G<=v.height-V){x.bindFramebuffer(U.FRAMEBUFFER,vt);let bt=v.textures[ft],Nt=bt.format,Bt=bt.type;if(v.textures.length>1&&U.readBuffer(U.COLOR_ATTACHMENT0+ft),!S.textureFormatReadable(Nt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!S.textureTypeReadable(Bt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let St=U.createBuffer();U.bindBuffer(U.PIXEL_PACK_BUFFER,St),U.bufferData(U.PIXEL_PACK_BUFFER,pt.byteLength,U.STREAM_READ),U.readPixels(F,G,z,V,lt.convert(Nt),lt.convert(Bt),0);let Zt=$!==null?k.get($).__webglFramebuffer:null;x.bindFramebuffer(U.FRAMEBUFFER,Zt);let ce=U.fenceSync(U.SYNC_GPU_COMMANDS_COMPLETE,0);return U.flush(),await Sc(U,ce,4),U.bindBuffer(U.PIXEL_PACK_BUFFER,St),U.getBufferSubData(U.PIXEL_PACK_BUFFER,0,pt),U.deleteBuffer(St),U.deleteSync(ce),pt}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(v,F=null,G=0){let z=Math.pow(2,-G),V=Math.floor(v.image.width*z),pt=Math.floor(v.image.height*z),xt=F!==null?F.x:0,ft=F!==null?F.y:0;q.setTexture2D(v,0),U.copyTexSubImage2D(U.TEXTURE_2D,G,0,0,xt,ft,V,pt),x.unbindTexture()},this.copyTextureToTexture=function(v,F,G=null,z=null,V=0,pt=0){let xt,ft,vt,bt,Nt,Bt,St,Zt,ce,oe=v.isCompressedTexture?v.mipmaps[pt]:v.image;if(G!==null)xt=G.max.x-G.min.x,ft=G.max.y-G.min.y,vt=G.isBox3?G.max.z-G.min.z:1,bt=G.min.x,Nt=G.min.y,Bt=G.isBox3?G.min.z:0;else{let he=Math.pow(2,-V);xt=Math.floor(oe.width*he),ft=Math.floor(oe.height*he),v.isDataArrayTexture?vt=oe.depth:v.isData3DTexture?vt=Math.floor(oe.depth*he):vt=1,bt=0,Nt=0,Bt=0}z!==null?(St=z.x,Zt=z.y,ce=z.z):(St=0,Zt=0,ce=0);let Kt=lt.convert(F.format),we=lt.convert(F.type),gt;F.isData3DTexture?(q.setTexture3D(F,0),gt=U.TEXTURE_3D):F.isDataArrayTexture||F.isCompressedArrayTexture?(q.setTexture2DArray(F,0),gt=U.TEXTURE_2D_ARRAY):(q.setTexture2D(F,0),gt=U.TEXTURE_2D),x.activeTexture(U.TEXTURE0),x.pixelStorei(U.UNPACK_FLIP_Y_WEBGL,F.flipY),x.pixelStorei(U.UNPACK_PREMULTIPLY_ALPHA_WEBGL,F.premultiplyAlpha),x.pixelStorei(U.UNPACK_ALIGNMENT,F.unpackAlignment);let Ue=x.getParameter(U.UNPACK_ROW_LENGTH),Wt=x.getParameter(U.UNPACK_IMAGE_HEIGHT),We=x.getParameter(U.UNPACK_SKIP_PIXELS),ln=x.getParameter(U.UNPACK_SKIP_ROWS),An=x.getParameter(U.UNPACK_SKIP_IMAGES);x.pixelStorei(U.UNPACK_ROW_LENGTH,oe.width),x.pixelStorei(U.UNPACK_IMAGE_HEIGHT,oe.height),x.pixelStorei(U.UNPACK_SKIP_PIXELS,bt),x.pixelStorei(U.UNPACK_SKIP_ROWS,Nt),x.pixelStorei(U.UNPACK_SKIP_IMAGES,Bt);let ui=v.isDataArrayTexture||v.isData3DTexture,Qt=F.isDataArrayTexture||F.isData3DTexture;if(v.isDepthTexture){let he=k.get(v),Cn=k.get(F),te=k.get(he.__renderTarget),Rn=k.get(Cn.__renderTarget);x.bindFramebuffer(U.READ_FRAMEBUFFER,te.__webglFramebuffer),x.bindFramebuffer(U.DRAW_FRAMEBUFFER,Rn.__webglFramebuffer);for(let di=0;di<vt;di++)ui&&(U.framebufferTextureLayer(U.READ_FRAMEBUFFER,U.COLOR_ATTACHMENT0,k.get(v).__webglTexture,V,Bt+di),U.framebufferTextureLayer(U.DRAW_FRAMEBUFFER,U.COLOR_ATTACHMENT0,k.get(F).__webglTexture,pt,ce+di)),U.blitFramebuffer(bt,Nt,xt,ft,St,Zt,xt,ft,U.DEPTH_BUFFER_BIT,U.NEAREST);x.bindFramebuffer(U.READ_FRAMEBUFFER,null),x.bindFramebuffer(U.DRAW_FRAMEBUFFER,null)}else if(V!==0||v.isRenderTargetTexture||k.has(v)){let he=k.get(v),Cn=k.get(F);x.bindFramebuffer(U.READ_FRAMEBUFFER,X),x.bindFramebuffer(U.DRAW_FRAMEBUFFER,R);for(let te=0;te<vt;te++)ui?U.framebufferTextureLayer(U.READ_FRAMEBUFFER,U.COLOR_ATTACHMENT0,he.__webglTexture,V,Bt+te):U.framebufferTexture2D(U.READ_FRAMEBUFFER,U.COLOR_ATTACHMENT0,U.TEXTURE_2D,he.__webglTexture,V),Qt?U.framebufferTextureLayer(U.DRAW_FRAMEBUFFER,U.COLOR_ATTACHMENT0,Cn.__webglTexture,pt,ce+te):U.framebufferTexture2D(U.DRAW_FRAMEBUFFER,U.COLOR_ATTACHMENT0,U.TEXTURE_2D,Cn.__webglTexture,pt),V!==0?U.blitFramebuffer(bt,Nt,xt,ft,St,Zt,xt,ft,U.COLOR_BUFFER_BIT,U.NEAREST):Qt?U.copyTexSubImage3D(gt,pt,St,Zt,ce+te,bt,Nt,xt,ft):U.copyTexSubImage2D(gt,pt,St,Zt,bt,Nt,xt,ft);x.bindFramebuffer(U.READ_FRAMEBUFFER,null),x.bindFramebuffer(U.DRAW_FRAMEBUFFER,null)}else Qt?v.isDataTexture||v.isData3DTexture?U.texSubImage3D(gt,pt,St,Zt,ce,xt,ft,vt,Kt,we,oe.data):F.isCompressedArrayTexture?U.compressedTexSubImage3D(gt,pt,St,Zt,ce,xt,ft,vt,Kt,oe.data):U.texSubImage3D(gt,pt,St,Zt,ce,xt,ft,vt,Kt,we,oe):v.isDataTexture?U.texSubImage2D(U.TEXTURE_2D,pt,St,Zt,xt,ft,Kt,we,oe.data):v.isCompressedTexture?U.compressedTexSubImage2D(U.TEXTURE_2D,pt,St,Zt,oe.width,oe.height,Kt,oe.data):U.texSubImage2D(U.TEXTURE_2D,pt,St,Zt,xt,ft,Kt,we,oe);x.pixelStorei(U.UNPACK_ROW_LENGTH,Ue),x.pixelStorei(U.UNPACK_IMAGE_HEIGHT,Wt),x.pixelStorei(U.UNPACK_SKIP_PIXELS,We),x.pixelStorei(U.UNPACK_SKIP_ROWS,ln),x.pixelStorei(U.UNPACK_SKIP_IMAGES,An),pt===0&&F.generateMipmaps&&U.generateMipmap(gt),x.unbindTexture()},this.initRenderTarget=function(v){k.get(v).__webglFramebuffer===void 0&&q.setupRenderTarget(v)},this.initTexture=function(v){v.isCubeTexture?q.setTextureCube(v,0):v.isData3DTexture?q.setTexture3D(v,0):v.isDataArrayTexture||v.isCompressedArrayTexture?q.setTexture2DArray(v,0):q.setTexture2D(v,0),x.unbindTexture()},this.resetState=function(){B=0,H=0,$=null,x.reset(),mt.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return je}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;let e=this.getContext();e.drawingBufferColorSpace=kt._getDrawingBufferColorSpace(t),e.unpackColorSpace=kt._getUnpackColorSpace()}};var eg=1-Math.pow(.001,.0033333333333333335),ol=.6,ng=.25,ig=.25,La={x:0,y:0,z:0,r:120},ll=class{state=7;next(){return this.state=(this.state*1664525+1013904223)%4294967296,this.state/4294967296}jiggle(){return(this.next()-.5)*1e-6}};function sg(i,t,e){let s=new Float64Array(721),r=t,a=0;for(let u=1;u<=720;u++){let d=u/720*Math.PI*2,h=Math.cos(d)*t,p=Math.sin(d)*e;s[u]=(s[u-1]??0)+Math.hypot(h-r,p-a),r=h,a=p}let o=s[720]??1,c=[],l=0;for(let u=0;u<i;u++){let d=(u/i+.75)%1*o;for(l=0;l<720&&(s[l+1]??o)<d;)l++;c.push(l/720*Math.PI*2)}return c}function ci(i){return 30*Math.sqrt(Math.max(1,i))+34}function cl(i,t,e){let n=[...i.entries()],s=new Map;if(n.length===0)return s;let r=0;if(e!==void 0&&i.has(e)&&n.length>1&&(r=ci(i.get(e)??1),s.set(e,{x:0,y:0,z:0,r}),n=n.filter(([d])=>d!==e)),n.length===1){let d=n[0];if(d){let h=r>0?r+ci(d[1]):0;s.set(d[0],{x:h,y:0,z:0,r:ci(d[1])})}return s}let a=n.length,o=Math.pow(Math.max(.7,Math.min(2.2,t)),.85),l=sg(a,o,1/o).map((d,h)=>({x:Math.cos(d)*o,y:h%2===0?.26:-.26,z:Math.sin(d)/o})),u=0;for(let d=0;d<a;d++)for(let h=d+1;h<a;h++){let p=l[d],g=l[h],y=n[d],m=n[h];if(!p||!g||!y||!m)continue;let f=Math.hypot(p.x-g.x,p.y-g.y,p.z-g.z);f<=0||(u=Math.max(u,(ci(y[1])+ci(m[1]))/f))}return u*=1.18,r>0&&n.forEach(([,d],h)=>{let p=l[h];if(!p)return;let g=Math.hypot(p.x,p.y,p.z);g<=0||(u=Math.max(u,(r+ci(d))*1.12/g))}),n.forEach(([d,h],p)=>{let g=l[p]??{x:0,y:0,z:0};s.set(d,{x:g.x*u,y:g.y*u,z:g.z*u,r:ci(h)})}),s}var rg=Math.PI*(3-Math.sqrt(5));function ih(i){return i.x!==void 0&&i.y!==void 0&&i.z!==void 0}function ag(i,t,e){let n=new Map,s=0;for(let o of i)ih(o)||(n.set(o.group,(n.get(o.group)??0)+1),s+=1);let r=new Map,a=0;return i.map(o=>{if(ih(o))return{id:o.id,group:o.group,radius:o.radius,x:o.x,y:o.y,z:o.z,vx:0,vy:0,vz:0,fx:null,fy:null,fz:null};let c=r.get(o.group)??0;r.set(o.group,c+1);let l=t==="grouped"?c:a++,u=(t==="grouped"?n.get(o.group):s)??1,d=t==="grouped"?e.get(o.group)??La:La,h=9*Math.sqrt(l+.5),p=l*rg,g=1-2*(l+.5)/u,y=Math.sqrt(Math.max(0,1-g*g));return{id:o.id,group:o.group,radius:o.radius,x:d.x+h*y*Math.cos(p),y:d.y+h*g,z:d.z+h*y*Math.sin(p),vx:0,vy:0,vz:0,fx:null,fy:null,fz:null}})}function og(i,t,e){let n=[],s=new Map;for(let a of i)!t.has(a.source)||!t.has(a.target)||(n.push(a),s.set(a.source,(s.get(a.source)??0)+1),s.set(a.target,(s.get(a.target)??0)+1));let r=[];for(let a of n){let o=t.get(a.source),c=t.get(a.target);if(!o||!c)continue;let l=o.group===c.group,u=e==="grouped"?l?62:190:76,d=e==="grouped"?l?.5:.015:.6,h=s.get(a.source)??0,p=s.get(a.target)??0;r.push({source:o,target:c,distance:u,strength:d,bias:h/(h+p)})}return r}var Ds=class{nodes;nodesById;links;layout;centres;rng=new ll;simAlpha=1;simAlphaTarget=0;constructor(t){this.layout=t.layout,this.centres=t.centres,this.nodes=ag(t.nodes,t.layout,t.centres),this.nodesById=new Map(this.nodes.map(e=>[e.id,e])),this.links=og(t.links,this.nodesById,t.layout)}byId(t){return this.nodesById.get(t)}alpha(){return this.simAlpha}reheat(){this.simAlphaTarget=ng,this.simAlpha=Math.max(this.simAlpha,ig)}cool(){this.simAlphaTarget=0}pin(t,e,n,s){let r=this.nodesById.get(t);r&&(r.fx=e,r.fy=n,r.fz=s)}unpin(t){let e=this.nodesById.get(t);e&&(e.fx=null,e.fy=null,e.fz=null)}tick(t=1){for(let e=0;e<t;e++)this.stepOnce()}stepOnce(){this.simAlpha+=(this.simAlphaTarget-this.simAlpha)*eg,this.applyCharge(),this.applyLink(),this.layout==="free"&&this.applyCenterMeanShift(),this.applyPositional(),this.applyCollide();for(let t of this.nodes)t.fx!==null&&t.fy!==null&&t.fz!==null?(t.x=t.fx,t.y=t.fy,t.z=t.fz,t.vx=0,t.vy=0,t.vz=0):(t.vx*=ol,t.vy*=ol,t.vz*=ol,t.x+=t.vx,t.y+=t.vy,t.z+=t.vz)}centreOf(t){return this.centres.get(t)??La}applyCharge(){let t=this.layout==="grouped"?-165:-150,e=this.layout==="grouped"?300:520,n=e*e,s=this.nodes;for(let r=0;r<s.length;r++){let a=s[r];if(a)for(let o=r+1;o<s.length;o++){let c=s[o];if(!c)continue;let l=c.x-a.x,u=c.y-a.y,d=c.z-a.z,h=l*l+u*u+d*d;if(h===0&&(l=this.rng.jiggle(),u=this.rng.jiggle(),d=this.rng.jiggle(),h=l*l+u*u+d*d),h>=n)continue;h<1&&(h=Math.sqrt(h));let p=t*this.simAlpha/h;a.vx+=l*p,a.vy+=u*p,a.vz+=d*p,c.vx-=l*p,c.vy-=u*p,c.vz-=d*p}}}applyLink(){for(let t of this.links){let{source:e,target:n,distance:s,strength:r,bias:a}=t,o=n.x+n.vx-e.x-e.vx,c=n.y+n.vy-e.y-e.vy,l=n.z+n.vz-e.z-e.vz,u=Math.sqrt(o*o+c*c+l*l);u===0&&(o=this.rng.jiggle(),c=this.rng.jiggle(),l=this.rng.jiggle(),u=Math.sqrt(o*o+c*c+l*l));let d=(u-s)/u*this.simAlpha*r;o*=d,c*=d,l*=d,n.vx-=o*a,n.vy-=c*a,n.vz-=l*a;let h=1-a;e.vx+=o*h,e.vy+=c*h,e.vz+=l*h}}applyCenterMeanShift(){let t=this.nodes,e=t.length;if(e===0)return;let n=0,s=0,r=0;for(let l of t)n+=l.x,s+=l.y,r+=l.z;let a=n/e,o=s/e,c=r/e;for(let l of t)l.x-=a,l.y-=o,l.z-=c}applyPositional(){let t=this.layout==="grouped"?.15:.055;for(let e of this.nodes){let n=this.layout==="grouped"?this.centreOf(e.group):La;e.vx+=(n.x-e.x)*t*this.simAlpha,e.vy+=(n.y-e.y)*t*this.simAlpha,e.vz+=(n.z-e.z)*t*this.simAlpha}}applyCollide(){let t=this.nodes,e=.9;for(let n=0;n<t.length;n++){let s=t[n];if(!s)continue;let r=s.radius+5,a=r*r,o=s.x+s.vx,c=s.y+s.vy,l=s.z+s.vz;for(let u=n+1;u<t.length;u++){let d=t[u];if(!d)continue;let h=d.radius+5,p=r+h,g=o-(d.x+d.vx),y=c-(d.y+d.vy),m=l-(d.z+d.vz),f=g*g+y*y+m*m;if(f>=p*p)continue;g===0&&(g=this.rng.jiggle(),f+=g*g),y===0&&(y=this.rng.jiggle(),f+=y*y),m===0&&(m=this.rng.jiggle(),f+=m*m),f=Math.sqrt(f);let w=(p-f)/f*e,A=g*w,M=y*w,T=m*w,b=h*h,C=b/(a+b),_=1-C;s.vx+=A*C,s.vy+=M*C,s.vz+=T*C,d.vx-=A*_,d.vy-=M*_,d.vz-=T*_}}}};var hi="#FAF9F6",Ns="#C28E0E",qi=new Map([["parties",{colour:"#9AA0A8",ink:"#5A616B"}],["unions",{colour:"#E15759",ink:"#A93843"}],["finance",{colour:"#4E79A7",ink:"#365F86"}],["individuals",{colour:"#79706E",ink:"#57504E"}],["property",{colour:"#F28E2B",ink:"#A85A0F"}],["mining & energy",{colour:"#9C755F",ink:"#6E4F3D"}],["hospitality",{colour:"#EDC948",ink:"#7A6414"}],["media & tech",{colour:"#76B7B2",ink:"#3E7A75"}],["health & pharma",{colour:"#59A14F",ink:"#3B7134"}],["gambling",{colour:"#B07AA1",ink:"#7D5273"}],["legal & lobbying",{colour:"#6A51A3",ink:"#4A3775"}],["defence & security",{colour:"#37474F",ink:"#263238"}],["agriculture",{colour:"#6B8E23",ink:"#4A6318"}],["retail",{colour:"#FF9DA7",ink:"#B04A56"}],["tobacco & alcohol",{colour:"#A65628",ink:"#7A3C1B"}],["other",{colour:"#999966",ink:"#6B6B3D"}]]),lg={colour:"#999966",ink:"#6B6B3D"};function Us(i){return qi.get(i)??lg}var Yi=40,cg=.22,hg=3.2,sh=380,ug=520,dg=230,fg=560,pg=.05,rh=.35,ah=Math.PI-.55;function mg(i){return Math.max(.6,Math.min(5,.55+1.2*Math.log10(1+Math.max(0,i))))}function gg(i){let t=new Map;i.forEach((n,s)=>{let r=n.source<n.target?`${n.source} ${n.target}`:`${n.target} ${n.source}`,a=t.get(r);a?a.push(s):t.set(r,[s])});let e=new Array(i.length).fill(0);for(let n of t.values())n.length!==1&&n.forEach((s,r)=>{e[s]=-1+2*r/(n.length-1)});return e}function oh(){try{let i=document.createElement("canvas");return!!(i.getContext("webgl2")??i.getContext("webgl"))}catch{return!1}}function xg(){let i=[],t=[];for(let e of qi.values())i.push(new Pt(e.colour)),t.push(e.ink);return{cats:i,inks:t,surface:new Pt(hi),accent:new Pt(Ns)}}var Da=class{canvas;labelLayer;onSelect;renderer;scene=new as;camera;nodeGroup=new tn;edgeGroup=new tn;territoryGroup=new tn;hemi;key;fill;fog;sphereGeo=new si(1,40,24);shellGeo=new si(1,32,18);tubeGeo=new Fi(1,1,1,7,1,!0);coneGeo=new ds(1,1,10);ringGeo=new ps(1.18,1.32,48);territoryGeo=new si(1,28,18);selectionRing;selectionRingMaterial;traceRing;traceRingMaterial;palette;popup;popupName;popupMeta;popupCounts;placedLabelBoxes=[];data=null;sim=null;centres=new Map;nodeVisuals=new Map;edgeVisuals=[];territories=[];paintRank=[];worldCentre=new N;worldRadius=320;emphasis={selectedId:null,pathEdges:null,pathFrom:null};hoveredId=null;neighbourIds=null;pathNodeIds=null;pathEdgeKeys=null;insets={left:0,right:0,bottom:0};view;distGoal;tween=null;idleSpin;reduced;reducedQuery=null;onContextLost=null;onReducedChange=t=>{this.reduced=t.matches,t.matches&&(this.idleSpin=!1)};viewOwnedFlag=!1;focusOwnedFlag=!1;fitDist=420;pointers=new Map;orbit=null;pinch=null;drag=null;gestured=!1;hoverPos=null;hoverDirty=!1;raycaster=new ys;frameHandle=null;lastFrame=performance.now();frameCount=0;renderDirty=!0;resizeObserver;disposed=!1;width=1;height=1;constructor(t,e,n,s){this.canvas=t,this.labelLayer=e,this.onSelect=n,s&&(this.onContextLost=a=>{a.preventDefault(),s()},t.addEventListener("webglcontextlost",this.onContextLost)),this.reducedQuery=typeof globalThis.matchMedia=="function"?globalThis.matchMedia("(prefers-reduced-motion: reduce)"):null,this.reduced=this.reducedQuery?.matches??!1,this.idleSpin=!this.reduced,this.reducedQuery?.addEventListener("change",this.onReducedChange),this.renderer=new Ra({canvas:t,antialias:!0,alpha:!1}),this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,2)),this.popup=document.createElement("div"),this.popup.className="rp-map3d-popup",this.popup.style.display="none",this.popupName=document.createElement("div"),this.popupName.className="rp-map3d-popup-name",this.popupMeta=document.createElement("div"),this.popupMeta.className="rp-map3d-popup-meta",this.popupCounts=document.createElement("div"),this.popupCounts.className="rp-map3d-popup-counts";let r=document.createElement("div");r.className="rp-map3d-popup-hint",r.textContent="Click for details",this.popup.append(this.popupName,this.popupMeta,this.popupCounts,r),e.appendChild(this.popup),this.palette=xg(),this.camera=new Ce(Yi,1.5,2,9e3),this.fog=new rs(this.palette.surface.clone(),600,2400),this.scene.fog=this.fog,this.scene.add(this.territoryGroup),this.scene.add(this.edgeGroup),this.scene.add(this.nodeGroup),this.hemi=new _s(16777215,8947848,.95),this.key=new Bi(16777215,1.15),this.key.position.set(.55,1,.4),this.fill=new Bi(16777215,.3),this.fill.position.set(-.6,-.35,-.7),this.scene.add(this.hemi,this.key,this.fill),this.selectionRingMaterial=new en({transparent:!0,opacity:0,depthWrite:!1,side:Ze}),this.selectionRing=new me(this.ringGeo,this.selectionRingMaterial),this.selectionRing.visible=!1,this.scene.add(this.selectionRing),this.traceRingMaterial=this.selectionRingMaterial.clone(),this.traceRing=new me(this.ringGeo,this.traceRingMaterial),this.traceRing.visible=!1,this.scene.add(this.traceRing),this.applyPaletteToScene(),this.view={target:new N,theta:-.5,phi:.95,dist:640},this.distGoal=this.view.dist,this.resizeObserver=new ResizeObserver(()=>this.handleResize()),this.resizeObserver.observe(t.parentElement??t),this.handleResize(),this.bindPointerHandlers(),this.frameHandle=requestAnimationFrame(this.frame)}applyPaletteToScene(){let t=this.palette.surface;this.renderer.setClearColor(t,1),this.fog.color.copy(t),this.hemi.color.copy(t.clone().lerp(new Pt(16777215),.72)),this.hemi.groundColor.copy(t.clone().multiplyScalar(.55)),this.selectionRingMaterial.color.copy(this.palette.accent),this.traceRingMaterial.color.copy(this.palette.accent)}catColour(t){return this.palette.cats[t]??this.palette.accent}applyNodeColour(t){let e=t.colour;t.hollow?(t.material.color.copy(this.palette.surface),t.material.emissive.set(0),t.shellMaterial.color.copy(e)):(t.material.color.copy(e),t.material.emissive.copy(e).multiplyScalar(.16),t.shellMaterial.color.copy(e))}applyEdgeColour(t){let e=this.pathEdgeKeys?.has(t.key)??!1,n=this.emphasis.selectedId??this.hoveredId,s=n!==null&&(t.edge.source===n||t.edge.target===n);if(e){t.material.color.copy(this.palette.accent),t.coneMaterial.color.copy(this.palette.accent);return}if(s){let a=n?this.nodeVisuals.get(n):void 0,o=a?a.colour:this.palette.accent;t.material.color.copy(o),t.coneMaterial.color.copy(o);return}let r=t.from.colour;t.material.color.copy(r),t.coneMaterial.color.copy(r)}setData(t){this.data=t;let e=new Map;for(let[l,u]of this.nodeVisuals)e.set(l,{x:u.sim.x,y:u.sim.y,z:u.sim.z});let n=this.nodeVisuals.size===0,s=new Map;for(let l of t.nodes)s.set(l.group,(s.get(l.group)??0)+1);let r=new Map([...s.entries()].sort((l,u)=>u[1]-l[1]||l[0].localeCompare(u[0]))),a=cl(r,t.aspect,t.centralGroup);this.centres=a,!this.viewOwnedFlag&&a.size>2&&(this.view.theta=this.bestTheta(a));let o=l=>Oa(t.measure,t.measure==="links"?t.degrees.get(l.id)??0:l.weight);this.sim=new Ds({nodes:t.nodes.map(l=>{let u=e.get(l.id);return{id:l.id,group:l.group,radius:o(l),...u?{x:u.x,y:u.y,z:u.z}:{}}}),links:t.edges.map(l=>({source:l.source,target:l.target})),layout:t.layout,centres:a}),this.sim.tick(300),this.clearScene(),t.nodes.forEach((l,u)=>{let d=this.sim?.byId(l.id);if(!d)return;let h=t.groupStyles.get(l.group),p=h?.slot??0,g=h?.hollow??!1,y=t.degrees.get(l.id)??0,m=t.measure==="links"&&y===0,f=o(l),w=new ms({roughness:.42,metalness:.04,transparent:!0,opacity:1}),A=new me(this.sphereGeo,w);A.userData.nodeId=l.id;let M=new en({transparent:!0,opacity:g?.95:0,side:Ee,depthWrite:!1}),T=new me(this.shellGeo,M);T.raycast=()=>{},A.add(T),T.scale.setScalar(g?1.22:1.14),this.nodeGroup.add(A);let b=document.createElement("div");b.className="rp-map3d-label",b.textContent=Fa(l.label),b.style.display="none",this.labelLayer.appendChild(b);let C={node:l,sim:d,r:m?Math.max(3.5,f-1.5):f,slot:p,colour:l.colour?new Pt(l.colour):this.catColour(p).clone(),hollow:g,unlinked:m,mesh:A,material:w,shell:T,shellMaterial:M,opacity:{current:1,target:1},shellOpacity:{current:g?.95:0,target:g?.95:0},scale:{current:n&&!this.reduced?.001:1,target:1},lift:{current:0,target:0},degree:y,bornAt:n&&!this.reduced?performance.now()+Math.min(u*9,900):0,label:b};this.applyNodeColour(C),this.nodeVisuals.set(l.id,C)});let c=gg(t.edges);if(this.edgeVisuals=[],t.edges.forEach((l,u)=>{let d=this.nodeVisuals.get(l.source),h=this.nodeVisuals.get(l.target);if(!d||!h)return;let p=new en({transparent:!0,depthWrite:!1}),g=new me(this.tubeGeo,p);g.raycast=()=>{};let y=new en({transparent:!0,depthWrite:!1}),m=new me(this.coneGeo,y);m.raycast=()=>{},m.visible=!1,this.edgeGroup.add(g,m);let f=d.node.group!==h.node.group,w={edge:l,key:`${l.source}|${l.label}|${l.target}`,from:d,to:h,mesh:g,material:p,cone:m,coneMaterial:y,width:mg(l.weight),crossing:f,lateral:c[u]??0,opacity:{current:0,target:f?.16:.4},emphasised:!1,label:null};this.applyEdgeColour(w),this.edgeVisuals.push(w)}),this.territories=[],t.layout==="grouped"&&r.size>1)for(let[l]of r){let u=t.groupStyles.get(l);if(!u)continue;let d=new en({transparent:!0,opacity:.055,depthWrite:!1}),h=this.palette.cats[u.slot];h&&d.color.copy(h);let p=new me(this.territoryGeo,d);p.raycast=()=>{},p.renderOrder=-2,this.territoryGroup.add(p);let g=document.createElement("div");g.className="rp-map3d-territory",g.style.color=this.palette.inks[u.slot]??"#5A616B",g.textContent=`${l.toUpperCase()} \xB7 ${s.get(l)??0}`,g.style.display="none",this.labelLayer.appendChild(g),this.territories.push({group:l,style:u,mesh:p,material:d,caption:g,centre:new N,r:0})}this.paintRank=[...this.nodeVisuals.values()].sort((l,u)=>u.r-l.r),this.updateWorldBounds(),this.updateTerritories(),this.updateEmphasisSets(),this.renderDirty=!0}clearScene(){for(let t of this.nodeVisuals.values())t.material.dispose(),t.shellMaterial.dispose(),t.label.remove();for(let t of this.edgeVisuals)t.material.dispose(),t.coneMaterial.dispose(),t.label?.remove();for(let t of this.territories)t.material.dispose(),t.caption.remove();this.nodeGroup.clear(),this.edgeGroup.clear(),this.territoryGroup.clear(),this.nodeVisuals.clear(),this.edgeVisuals=[],this.territories=[]}updateWorldBounds(){let t=new N,e=0;for(let s of this.nodeVisuals.values())t.x+=s.sim.x,t.y+=s.sim.y,t.z+=s.sim.z,e+=1;if(e===0)return;t.multiplyScalar(1/e);let n=120;for(let s of this.nodeVisuals.values()){let r=Math.hypot(s.sim.x-t.x,s.sim.y-t.y,s.sim.z-t.z)+s.r;r>n&&(n=r)}this.worldCentre.copy(t),this.worldRadius=n}setEmphasis(t){this.emphasis=t,this.updateEmphasisSets()}setHovered(t){this.hoveredId!==t&&(this.hoveredId=t,this.updatePopup(),this.canvas.style.cursor=t?"pointer":"grab",this.updateEmphasisSets())}updateEmphasisSets(){let{selectedId:t,pathEdges:e,pathFrom:n}=this.emphasis,s=t??this.hoveredId;if(s){let r=new Set([s]);for(let a of this.edgeVisuals)a.edge.source===s&&r.add(a.edge.target),a.edge.target===s&&r.add(a.edge.source);this.neighbourIds=r}else this.neighbourIds=null;if(e){let r=new Set;for(let a of e)r.add(a.source),r.add(a.target);this.pathNodeIds=r,this.pathEdgeKeys=new Set(e.map(a=>`${a.source}|${a.label}|${a.target}`))}else this.pathNodeIds=null,this.pathEdgeKeys=null;for(let r of this.nodeVisuals.values()){let a=r.node.id,o=a===t,c=a===this.hoveredId,l=a===n,u=this.neighbourIds?.has(a)??!0,d=this.pathNodeIds?.has(a)??!1,h=this.pathNodeIds&&!d||!this.pathNodeIds&&!u,p=o||c||l||d;r.opacity.target=h?.3:r.unlinked&&!p?.6:1,r.shellOpacity.target=r.hollow?h?.2:.95:c&&!o?.4:0,r.scale.target=c&&!o?1.24:o?1.14:p?1.08:1,r.lift.target=c&&!o?1:0}for(let r of this.edgeVisuals){let a=this.pathEdgeKeys?.has(r.key)??!1,o=s!==null&&(r.edge.source===s||r.edge.target===s),c=this.pathEdgeKeys&&!a||s!==null&&!o&&!this.pathEdgeKeys,l=a||o;r.emphasised=l,r.opacity.target=c?.06:l?.92:r.crossing?.16:.4,this.applyEdgeColour(r)}this.updatePopup(),this.renderDirty=!0}updatePopup(){let t=this.hoveredId?this.nodeVisuals.get(this.hoveredId):void 0;if(!t||t.node.id===this.emphasis.selectedId){this.popup.style.display="none";return}let e=t.node;this.popupName.textContent=e.label,this.popupMeta.replaceChildren();let n=document.createElement("span");n.className="rp-map3d-popup-dot",n.style.background=`#${t.colour.getHexString()}`;let s=document.createElement("span");s.textContent=e.kind==="party"?"political party":(e.industry??e.group).replace(/_/g," "),s.style.color=this.palette.inks[t.slot]??"#5A616B",this.popupMeta.append(n,s);let r=t.degree===1?"1":`${t.degree}`,a=e.kind==="party"?t.degree===1?"1 donor shown":`${r} donors shown`:t.degree===1?"1 party":`${r} parties`;this.popupCounts.textContent=e.total!==void 0?`${$n(e.total)} \xB7 ${a}`:a,this.labelLayer.appendChild(this.popup),this.popup.style.display="block",this.positionPopup()}positionPopup(){if(this.popup.style.display==="none")return;let t=this.hoveredId?this.nodeVisuals.get(this.hoveredId):void 0;if(!t){this.popup.style.display="none";return}if(this.labelVec.set(t.sim.x,t.sim.y,t.sim.z).project(this.camera),this.labelVec.z>1||this.labelVec.z<-1){this.popup.style.display="none";return}let e=(this.labelVec.x*.5+.5)*this.width,n=(-this.labelVec.y*.5+.5)*this.height,s=Math.hypot(t.sim.x-this.camera.position.x,t.sim.y-this.camera.position.y,t.sim.z-this.camera.position.z),r=Math.tan(ai.degToRad(Yi/2)),a=t.r*t.scale.current*(this.height/2)/(s*r)*(1+t.lift.current*.15),o=this.popup.offsetWidth,c=this.popup.offsetHeight,l=e+a+16;l+o>this.width-8&&(l=e-a-16-o);let u=Math.max(8,Math.min(this.height-c-8,n-c/2));this.popup.style.transform=`translate(${Math.max(8,l).toFixed(1)}px, ${u.toFixed(1)}px)`}setInsets(t){this.insets=t}get viewOwned(){return this.viewOwnedFlag}get focusOwned(){return this.focusOwnedFlag}claimView(){this.tween=null,this.viewOwnedFlag=!0,this.focusOwnedFlag=!1,this.idleSpin=!1}freeBox(){let t=Math.max(1,this.width-this.insets.left-this.insets.right),e=Math.max(1,this.height-this.insets.bottom);return{w:t,h:e,cx:this.insets.left+t/2,cy:e/2}}frameFor(t){let e=this.freeBox(),n=ai.degToRad(Yi/2),s=Math.max(.2,e.h/this.height),r=Math.max(.2,e.w/this.width),a=Math.atan(Math.tan(n)*s*.9),o=Math.atan(Math.tan(n)*this.camera.aspect*r*.9),c=t/Math.tan(Math.min(a,o));return{box:e,dist:c}}worldPerPixel(t){return 2*t*Math.tan(ai.degToRad(Yi/2))/this.height}offsetTarget(t,e){let n=this.freeBox(),s=this.worldPerPixel(e),r=n.cx-this.width/2,a=n.cy-this.height/2,o=new N,c=new N,l=new N;return this.camera.matrixWorld.extractBasis(o,c,l),t.clone().addScaledVector(o,-r*s).addScaledVector(c,a*s)}fit(t=!0){if(this.tween=null,this.viewOwnedFlag=!1,this.focusOwnedFlag=!1,this.nodeVisuals.size===0)return;this.updateWorldBounds(),this.updateCamera();let e=this.fitDistance();this.fitDist=e;let s={target:this.offsetTarget(this.worldCentre,e),theta:this.view.theta,phi:this.view.phi,dist:e};this.moveView(s,t?ug:0)}bestTheta(t){let e=this.view.phi,n=[...t.values()],s=this.view.theta,r=-1/0;for(let a=0;a<36;a++){let o=a/36*Math.PI*2,c=Math.cos(o),l=-Math.sin(o),u=Math.cos(e),d=1/0;for(let h=0;h<n.length;h++)for(let p=h+1;p<n.length;p++){let g=n[h],y=n[p];if(!g||!y)continue;let m=(g.x-y.x)*c+(g.z-y.z)*l,f=(g.y-y.y)*Math.sin(e)-((g.x-y.x)*-l+(g.z-y.z)*c)*u,w=Math.hypot(m,f)/(g.r+y.r);w<d&&(d=w)}d>r&&(r=d,s=o)}return s}fitDistance(){let{theta:t,phi:e}=this.view,n=new N(Math.sin(e)*Math.sin(t),Math.cos(e),Math.sin(e)*Math.cos(t)),s=new N().crossVectors(new N(0,1,0),n);s.lengthSq()<.001&&s.set(1,0,0),s.normalize();let r=new N().crossVectors(n,s),a=this.freeBox(),o=ai.degToRad(Yi/2),c=Math.atan(Math.tan(o)*this.camera.aspect*Math.max(.2,a.w/this.width)*.92),l=Math.atan(Math.tan(o)*Math.max(.2,a.h/this.height)*.92),u=new N,d=240;for(let h of this.nodeVisuals.values()){u.set(h.sim.x,h.sim.y,h.sim.z).sub(this.worldCentre);let p=u.dot(n),g=Math.abs(u.dot(s))+h.r,y=Math.abs(u.dot(r))+h.r+26;d=Math.max(d,g/Math.tan(c)+p,y/Math.tan(l)+p)}return d}focusOn(t,e){let n=this.nodeVisuals.get(t);if(!n)return null;this.updateCamera();let s=new N(n.sim.x,n.sim.y,n.sim.z),r=this.freeBox(),a=s.clone().project(this.camera),o=(a.x*.5+.5)*this.width,c=(-a.y*.5+.5)*this.height,l=Math.min(90,r.w*.18),u=Math.min(90,r.h*.18);if(a.z<1&&o>this.insets.left+l&&o<this.insets.left+r.w-l&&c>u&&c<r.h-u&&this.insets.bottom<=0)return null;let h=e;if(h===null){let g=n.r+30;for(let m of this.edgeVisuals){let f=m.edge.source===t?m.edge.target:m.edge.target===t?m.edge.source:null;if(f===null)continue;let w=this.nodeVisuals.get(f);if(!w)continue;let A=Math.hypot(w.sim.x-n.sim.x,w.sim.y-n.sim.y,w.sim.z-n.sim.z)+w.r;A>g&&(g=A)}let{dist:y}=this.frameFor(g*1.12);h=Math.min(this.view.dist,Math.max(dg,Math.min(fg,y)))}h=Math.max(this.minDist(),Math.min(this.maxDist(),h));let p=this.offsetTarget(s,h);return this.moveView({target:p,theta:this.view.theta,phi:this.view.phi,dist:h},sh),this.viewOwnedFlag=!0,this.focusOwnedFlag=!0,this.idleSpin=!1,h}nudgeForInsets(t,e){if(t===0&&e===0)return;let n=this.worldPerPixel(this.view.dist),s=new N,r=new N,a=new N;this.camera.matrixWorld.extractBasis(s,r,a);let o=this.view.target.clone().addScaledVector(s,-t*n).addScaledVector(r,e*n);this.moveView({...this.view,target:o},sh)}zoomBy(t){this.claimView(),this.distGoal=Math.max(this.minDist(),Math.min(this.maxDist(),this.distGoal/t))}minDist(){return Math.max(60,this.fitDist*cg)}maxDist(){return this.fitDist*hg}moveView(t,e){if(this.reduced||e<=0){this.view={...t,target:t.target.clone()},this.distGoal=t.dist,this.tween=null,this.renderDirty=!0;return}this.tween={from:{...this.view,target:this.view.target.clone()},to:{...t,target:t.target.clone()},started:performance.now(),duration:e},this.distGoal=t.dist}bindPointerHandlers(){let t=this.canvas;t.addEventListener("pointerdown",this.onPointerDown),t.addEventListener("pointermove",this.onPointerMove),t.addEventListener("pointerup",this.onPointerUp),t.addEventListener("pointercancel",this.onPointerUp),t.addEventListener("pointerleave",this.onPointerLeave),t.addEventListener("wheel",this.onWheel,{passive:!1}),t.addEventListener("contextmenu",this.onContextMenu),t.addEventListener("keydown",this.onKeyDown)}unbindPointerHandlers(){let t=this.canvas;t.removeEventListener("pointerdown",this.onPointerDown),t.removeEventListener("pointermove",this.onPointerMove),t.removeEventListener("pointerup",this.onPointerUp),t.removeEventListener("pointercancel",this.onPointerUp),t.removeEventListener("pointerleave",this.onPointerLeave),t.removeEventListener("wheel",this.onWheel),t.removeEventListener("contextmenu",this.onContextMenu),t.removeEventListener("keydown",this.onKeyDown)}localPoint(t){let e=this.canvas.getBoundingClientRect();return{x:t.clientX-e.left,y:t.clientY-e.top}}capturePointer(t){try{this.canvas.setPointerCapture?.(t)}catch{}}releasePointer(t){try{this.canvas.releasePointerCapture?.(t)}catch{}}raycastVec=new N;raycastNode(t,e){this.updateCamera(),this.raycaster.setFromCamera(new Ut(t/this.width*2-1,-(e/this.height)*2+1),this.camera);let n=this.raycaster.ray.origin,s=this.raycaster.ray.direction,r=this.raycastVec,a=null,o=1/0;for(let c of this.nodeVisuals.values()){r.set(c.sim.x-n.x,c.sim.y-n.y,c.sim.z-n.z);let l=r.dot(s);if(l<0)continue;let u=c.r,d=r.lengthSq()-l*l;if(d>u*u)continue;let h=l-Math.sqrt(u*u-d);h<this.camera.near||h>=o||(a=c,o=h)}return a}onPointerDown=t=>{let e=this.localPoint(t);if(this.pointers.set(t.pointerId,e),this.capturePointer(t.pointerId),this.pointers.size===2){this.orbit=null,this.releaseDrag();let[s,r]=[...this.pointers.entries()];s&&r&&(this.claimView(),this.pinch={a:s[0],b:r[0],gap:Math.hypot(s[1].x-r[1].x,s[1].y-r[1].y),dist:this.view.dist,midX:(s[1].x+r[1].x)/2,midY:(s[1].y+r[1].y)/2});return}if(this.pointers.size>2||this.pinch)return;this.setHovered(null);let n=t.button===0?this.raycastNode(e.x,e.y):null;if(n&&this.sim){let s=new N;this.camera.getWorldDirection(s);let r=new N(n.sim.x,n.sim.y,n.sim.z),a=new qe().setFromNormalAndCoplanarPoint(s,r);this.drag={id:n.node.id,plane:a,moved:!1,lastX:e.x,lastY:e.y,travel:0},this.idleSpin=!1,this.sim.reheat();return}this.orbit={mode:t.button===2||t.button===1||t.shiftKey?"pan":"orbit",lastX:e.x,lastY:e.y,moved:0},this.canvas.style.cursor="grabbing"};onPointerMove=t=>{let e=this.localPoint(t);this.pointers.has(t.pointerId)&&this.pointers.set(t.pointerId,e);let n=this.pinch;if(n){let a=this.pointers.get(n.a),o=this.pointers.get(n.b);if(!a||!o)return;let c=Math.hypot(a.x-o.x,a.y-o.y);if(c>0&&n.gap>0){let d=Math.max(this.minDist(),Math.min(this.maxDist(),n.dist*(n.gap/c)));this.view.dist=d,this.distGoal=d}let l=(a.x+o.x)/2,u=(a.y+o.y)/2;this.panBy(l-n.midX,u-n.midY),n.midX=l,n.midY=u,this.renderDirty=!0;return}let s=this.drag;if(s&&this.sim){if(s.travel+=Math.abs(e.x-s.lastX)+Math.abs(e.y-s.lastY),s.lastX=e.x,s.lastY=e.y,s.travel<=3)return;s.moved=!0,this.raycaster.setFromCamera(new Ut(e.x/this.width*2-1,-(e.y/this.height)*2+1),this.camera);let a=new N;this.raycaster.ray.intersectPlane(s.plane,a)&&this.sim.pin(s.id,a.x,a.y,a.z);return}let r=this.orbit;if(r){let a=e.x-r.lastX,o=e.y-r.lastY;r.moved+=Math.abs(a)+Math.abs(o),r.lastX=e.x,r.lastY=e.y,r.moved>3&&this.claimView(),r.mode==="pan"?this.panBy(a,o):(this.view.theta-=a*.005,this.view.phi=Math.max(rh,Math.min(ah,this.view.phi-o*.005))),this.renderDirty=!0;return}this.hoverPos=e,this.hoverDirty=!0};panBy(t,e){let n=this.worldPerPixel(this.view.dist),s=new N,r=new N,a=new N;this.camera.matrixWorld.extractBasis(s,r,a),this.view.target.addScaledVector(s,-t*n).addScaledVector(r,e*n)}releaseDrag(){let t=this.drag;t&&(this.sim?.unpin(t.id),this.sim?.cool(),this.drag=null)}onPointerUp=t=>{let e=this.localPoint(t);if(this.pointers.delete(t.pointerId),this.releasePointer(t.pointerId),this.pinch){this.pointers.size<2&&(this.pinch=null,this.gestured=!0);return}let n=this.drag;if(n){let r=n.moved;this.releaseDrag(),r||this.onSelect(n.id);return}let s=this.orbit;if(this.orbit=null,this.canvas.style.cursor="grab",s&&s.moved<=3){if(this.gestured){this.gestured=!1;return}let r=this.raycastNode(e.x,e.y);this.onSelect(r?r.node.id:null)}this.gestured=!1};onPointerLeave=()=>{this.hoverPos=null,this.setHovered(null)};onWheel=t=>{t.preventDefault(),this.claimView();let e=t.deltaY<0?1.12:1/1.12;this.distGoal=Math.max(this.minDist(),Math.min(this.maxDist(),this.distGoal/e))};onContextMenu=t=>{t.preventDefault()};centremostNodeId(){let t=this.freeBox(),e=null,n=1/0,s=this.labelVec;for(let r of this.nodeVisuals.values()){if(s.set(r.sim.x,r.sim.y,r.sim.z).project(this.camera),s.z>1||s.z<-1)continue;let a=(s.x*.5+.5)*this.width,o=(-s.y*.5+.5)*this.height;if(a<0||a>this.width||o<0||o>this.height)continue;let c=Math.hypot(a-t.cx,o-t.cy);c<n&&(n=c,e=r.node.id)}return e}onKeyDown=t=>{switch(t.key){case"Enter":case" ":{let n=this.centremostNodeId();n&&this.onSelect(n);break}case"ArrowLeft":this.claimView(),this.view.theta+=.15;break;case"ArrowRight":this.claimView(),this.view.theta-=.15;break;case"ArrowUp":this.claimView(),this.view.phi=Math.max(rh,this.view.phi-.15);break;case"ArrowDown":this.claimView(),this.view.phi=Math.min(ah,this.view.phi+.15);break;case"+":case"=":this.zoomBy(1.3);break;case"-":this.zoomBy(1/1.3);break;default:return}t.preventDefault(),this.renderDirty=!0};handleResize(){let t=this.canvas.parentElement;if(!t)return;let e=t.getBoundingClientRect();e.width<1||e.height<1||(this.width=e.width,this.height=e.height,this.renderer.setSize(e.width,e.height,!1),this.camera.aspect=e.width/e.height,this.camera.updateProjectionMatrix(),!this.viewOwnedFlag&&this.nodeVisuals.size>0&&this.fit(!1),this.renderDirty=!0)}stepFades(t){let e=this.reduced?1:1-Math.exp(-t/110),n=!1,s=a=>{let o=a.target-a.current;return Math.abs(o)<.004?(a.current=a.target,a.current):(n=!0,a.current+=o*e,a.current)},r=performance.now();for(let a of this.nodeVisuals.values())a.bornAt>0&&r<a.bornAt?n=!0:(a.bornAt=0,s(a.scale)),s(a.opacity),s(a.shellOpacity),s(a.lift);for(let a of this.edgeVisuals)s(a.opacity);return n}frame=t=>{if(this.disposed)return;this.frameHandle=requestAnimationFrame(this.frame);let e=Math.min(64,t-this.lastFrame);this.lastFrame=t,this.frameCount+=1;let n=this.sim!==null&&(this.sim.alpha()>.02||this.drag!==null);n&&(this.sim?.tick(1),this.renderDirty=!0);let s=this.tween;if(s){let r=Math.min(1,(t-s.started)/s.duration),a=1-Math.pow(1-r,3);this.view.target.lerpVectors(s.from.target,s.to.target,a),this.view.theta=s.from.theta+(s.to.theta-s.from.theta)*a,this.view.phi=s.from.phi+(s.to.phi-s.from.phi)*a,this.view.dist=s.from.dist*Math.pow(s.to.dist/s.from.dist,a),r>=1&&(this.tween=null),this.renderDirty=!0}else{let r=this.distGoal-this.view.dist;Math.abs(r)>.5&&(this.view.dist+=r*(this.reduced?1:Math.min(1,e/90)),this.renderDirty=!0),this.idleSpin&&this.nodeVisuals.size>0&&(this.view.theta+=pg*e/1e3,this.renderDirty=!0)}if(this.stepFades(e)&&(this.renderDirty=!0),this.hoverDirty&&!this.drag&&!this.orbit&&!this.pinch&&(this.hoverDirty=!1,this.hoverPos)){let r=this.raycastNode(this.hoverPos.x,this.hoverPos.y);this.setHovered(r?r.node.id:null)}this.renderDirty&&(this.renderDirty=!1,this.updateCamera(),this.updateNodeMeshes(),this.updateEdgeMeshes(),n&&this.updateTerritories(),this.updateRings(),this.renderer.render(this.scene,this.camera),this.projectLabels(),(n||this.tween)&&(this.renderDirty=!0))};updateCamera(){let{target:t,theta:e,phi:n,dist:s}=this.view,r=Math.sin(n);this.camera.position.set(t.x+s*r*Math.sin(e),t.y+s*Math.cos(n),t.z+s*r*Math.cos(e)),this.camera.lookAt(t),this.camera.updateMatrixWorld(),this.fog.near=s+this.worldRadius*.35,this.fog.far=s+this.worldRadius*4.4}nodeLiftDir=new N;updateNodeMeshes(){for(let t of this.nodeVisuals.values()){let e=Math.max(.001,t.r*t.scale.current);t.mesh.position.set(t.sim.x,t.sim.y,t.sim.z),t.lift.current>.001&&(this.nodeLiftDir.copy(this.camera.position).sub(t.mesh.position).normalize(),t.mesh.position.addScaledVector(this.nodeLiftDir,t.lift.current*(t.r*.6+10))),t.mesh.scale.setScalar(e),t.material.opacity=t.opacity.current,t.material.depthWrite=t.opacity.current>.5,t.shellMaterial.opacity=t.shellOpacity.current,t.shell.visible=t.shellOpacity.current>.01}}edgeUp=new N(0,1,0);edgeTmpDir=new N;edgeTmpSide=new N;edgeTmpMid=new N;edgeTmpQuat=new Ye;updateEdgeMeshes(){let t=this.edgeTmpDir,e=this.edgeTmpSide,n=this.edgeTmpMid;for(let s of this.edgeVisuals){let{from:r,to:a}=s;t.set(a.sim.x-r.sim.x,a.sim.y-r.sim.y,a.sim.z-r.sim.z);let o=t.length();if(o<1){s.mesh.visible=!1,s.cone.visible=!1;continue}t.multiplyScalar(1/o);let c=r.r*r.scale.current,l=a.r*a.scale.current,u=s.emphasised?Math.max(4.5,s.width*3.2):0,d=c+1,h=l+u+1,p=Math.max(1,o-d-h);e.set(t.z,0,-t.x),e.lengthSq()<.01&&e.set(1,0,0),e.normalize();let g=s.lateral*Math.min(12,o*.1),y=d+p/2;n.set(r.sim.x+t.x*y+e.x*g,r.sim.y+t.y*y+e.y*g,r.sim.z+t.z*y+e.z*g);let m=s.emphasised?Math.max(s.width,1.5):s.width;if(s.mesh.visible=s.opacity.current>.01,s.mesh.position.copy(n),s.mesh.quaternion.copy(this.edgeTmpQuat.setFromUnitVectors(this.edgeUp,t)),s.mesh.scale.set(m,p,m),s.material.opacity=s.opacity.current,s.emphasised){s.cone.visible=!0,s.cone.position.set(a.sim.x-t.x*(l+u/2+1),a.sim.y-t.y*(l+u/2+1),a.sim.z-t.z*(l+u/2+1)),s.cone.quaternion.copy(this.edgeTmpQuat);let f=Math.max(2.2,m*2.1);s.cone.scale.set(f,u,f),s.coneMaterial.opacity=Math.min(1,s.opacity.current+.05)}else s.cone.visible=!1}}updateTerritories(){for(let t of this.territories){let e=0,n=0,s=0,r=0;for(let o of this.nodeVisuals.values())o.node.group===t.group&&(e+=o.sim.x,n+=o.sim.y,s+=o.sim.z,r+=1);if(r===0){t.mesh.visible=!1,t.caption.style.display="none";continue}e/=r,n/=r,s/=r;let a=0;for(let o of this.nodeVisuals.values()){if(o.node.group!==t.group)continue;let c=Math.hypot(o.sim.x-e,o.sim.y-n,o.sim.z-s)+o.r;c>a&&(a=c)}t.centre.set(e,n,s),t.r=a+22,t.mesh.visible=!0,t.mesh.position.set(e,n,s),t.mesh.scale.setScalar(t.r)}}updateRings(){let t=(e,n,s)=>{let r=s?this.nodeVisuals.get(s):void 0;if(!r){e.visible=!1;return}e.visible=!0,e.position.set(r.sim.x,r.sim.y,r.sim.z),e.scale.setScalar(r.r*r.scale.current),e.quaternion.copy(this.camera.quaternion),n.opacity=.85};t(this.selectionRing,this.selectionRingMaterial,this.emphasis.selectedId),t(this.traceRing,this.traceRingMaterial,this.emphasis.pathFrom!==this.emphasis.selectedId?this.emphasis.pathFrom:null)}labelVec=new N;projectLabels(){let t=this.camera,e=Math.tan(ai.degToRad(Yi/2)),n=this.emphasis.selectedId??this.hoveredId,s=[],r=Math.max(10,Math.min(48,Math.round(24*(this.fitDist/Math.max(1,this.view.dist))))),a=0,o=this.paintRank.map(c=>{this.labelVec.set(c.sim.x,c.sim.y,c.sim.z).project(t);let l=this.labelVec.z<=1&&this.labelVec.z>=-1,u=(this.labelVec.x*.5+.5)*this.width,d=(-this.labelVec.y*.5+.5)*this.height,h=Math.hypot(c.sim.x-t.position.x,c.sim.y-t.position.y,c.sim.z-t.position.z),p=c.r*c.scale.current*(this.height/2)/(h*e)*(1+c.lift.current*.15);return{ok:l,sx:u,sy:d,camDist:h,screenR:p,opacity:c.opacity.current}});for(let c=0;c<this.paintRank.length;c++){let l=this.paintRank[c],u=o[c];if(!l||!u)continue;let d=l.label,h=l.node.id===n||l.node.id===this.emphasis.pathFrom||(this.pathNodeIds?.has(l.node.id)??!1),p=this.neighbourIds?.has(l.node.id)??!1,g=l.node.id===this.hoveredId;if(!(h||p||g||a<r)||l.opacity.current<.2&&!g||!u.ok){d.style.display="none";continue}let{sx:m,sy:f,camDist:w,screenR:A}=u;if(m<-40||m>this.width+40||f<-20||f>this.height+20){d.style.display="none";continue}let T=(d.textContent??"").length*6.2*.5,b={x1:m-T,x2:m+T,y1:f-A-22,y2:f-A-4};if(!h&&!p&&!g){let _=m,E=f-A-13;if(o.some((D,W)=>W!==c&&D.ok&&D.opacity>.2&&D.screenR>13&&D.camDist<w-1&&Math.hypot(_-D.sx,E-D.sy)<D.screenR*.92)){d.style.display="none";continue}if(s.some(D=>b.x1<D.x2&&b.x2>D.x1&&b.y1<D.y2&&b.y2>D.y1)){d.style.display="none";continue}a+=1}s.push(b);let C=Math.max(0,Math.min(1,(w-this.fog.near)/Math.max(1,this.fog.far-this.fog.near)));d.style.display="block",d.style.transform=`translate(-50%, -100%) translate(${m.toFixed(1)}px, ${(f-A-4).toFixed(1)}px)`,d.style.opacity=String(Math.max(.35,(1-C*.5)*Math.min(1,l.opacity.current+.1))),h?d.setAttribute("data-emphasised",""):d.removeAttribute("data-emphasised"),l.node.id===this.emphasis.selectedId?d.setAttribute("data-selected",""):d.removeAttribute("data-selected")}this.placedLabelBoxes=s,this.positionPopup();for(let c of this.territories){if(!c.mesh.visible)continue;if(this.labelVec.copy(c.centre),this.labelVec.y+=c.r,this.labelVec.project(t),!(this.labelVec.z<1&&this.labelVec.z>-1)){c.caption.style.display="none";continue}let u=(this.labelVec.x*.5+.5)*this.width,d=(-this.labelVec.y*.5+.5)*this.height;c.caption.style.display="block",c.caption.style.transform=`translate(-50%, -100%) translate(${u.toFixed(1)}px, ${(d-6).toFixed(1)}px)`,c.caption.style.opacity=n?"0.3":"0.9"}this.projectEdgeLabels()}projectEdgeLabels(){for(let t of this.edgeVisuals){if(!(t.emphasised&&!!t.edge.label&&this.view.dist<this.fitDist*1.15)){t.label&&(t.label.style.display="none");continue}if(!t.label){let c=document.createElement("div");c.className="rp-map3d-edge-label",c.textContent=t.edge.label,this.labelLayer.appendChild(c),t.label=c}if(this.labelVec.set((t.from.sim.x+t.to.sim.x)/2,(t.from.sim.y+t.to.sim.y)/2,(t.from.sim.z+t.to.sim.z)/2).project(this.camera),this.labelVec.z>1||this.labelVec.z<-1){t.label.style.display="none";continue}let n=(this.labelVec.x*.5+.5)*this.width,s=(-this.labelVec.y*.5+.5)*this.height,r=t.edge.label.length*5.4*.5,a={x1:n-r,x2:n+r,y1:s-21,y2:s-5};if(this.placedLabelBoxes.some(c=>a.x1<c.x2&&a.x2>c.x1&&a.y1<c.y2&&a.y2>c.y1)){t.label.style.display="none";continue}t.label.style.display="block",t.label.style.transform=`translate(-50%, -140%) translate(${n.toFixed(1)}px, ${s.toFixed(1)}px)`}}dispose(){this.disposed=!0,this.frameHandle!==null&&cancelAnimationFrame(this.frameHandle),this.unbindPointerHandlers(),this.onContextLost&&this.canvas.removeEventListener("webglcontextlost",this.onContextLost),this.reducedQuery?.removeEventListener("change",this.onReducedChange),this.resizeObserver.disconnect(),this.clearScene(),this.popup.remove(),this.sphereGeo.dispose(),this.shellGeo.dispose(),this.tubeGeo.dispose(),this.coneGeo.dispose(),this.ringGeo.dispose(),this.territoryGeo.dispose(),this.selectionRingMaterial.dispose(),this.traceRingMaterial.dispose(),this.renderer.dispose()}};var lh=1e4;function hl(i,t){return i?i===t?`${i}`:`${i}\u2013${t}`:""}function _g(i){let t=new Map,e=0;for(let o of qi.keys())t.set(o,e++);let n=new Map;for(let o of i.nodes)n.set(o.group,(n.get(o.group)??0)+1);let s=new Map;for(let[o,c]of n){let l=Us(o);s.set(o,{slot:t.get(o)??t.get("other")??0,colour:l.colour,ink:l.ink,hollow:!1,count:c})}let r=i.nodes.map(o=>({id:o.id,label:o.label,group:o.group,weight:o.total/lh,kind:o.kind,industry:o.industry,total:o.total,count:o.count,firstYear:o.firstYear,lastYear:o.lastYear,...o.colour?{colour:o.colour}:{}})),a=i.edges.map(o=>({source:o.source,target:o.target,label:$n(o.total),weight:o.total/lh,total:o.total,count:o.count,firstYear:o.firstYear,lastYear:o.lastYear}));return{nodes:r,edges:a,groupStyles:s,degrees:Ba(a)}}var ch="money-map-styles",vg=`
.mm-root { position: relative; overflow: hidden; background: ${hi};
  font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #33322e; }
.mm-canvas { display: block; width: 100%; height: 100%; cursor: grab;
  touch-action: none; user-select: none; -webkit-user-select: none; outline-offset: -3px; }
.mm-canvas:focus-visible { outline: 2px solid ${Ns}; }
.mm-labels { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.rp-map3d-label { position: absolute; top: 0; left: 0; white-space: nowrap;
  font-size: 11px; color: #4a4942; will-change: transform;
  text-shadow: 0 0 4px ${hi}, 0 0 8px ${hi}; }
.rp-map3d-label[data-emphasised] { font-size: 12px; font-weight: 600; color: #26251f; }
.rp-map3d-label[data-selected] { font-size: 13px; }
.rp-map3d-territory { position: absolute; top: 0; left: 0; white-space: nowrap;
  font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
  text-shadow: 0 0 4px ${hi}; transition: opacity 160ms; }
.rp-map3d-edge-label { position: absolute; top: 0; left: 0; white-space: nowrap;
  font-size: 10.5px; font-weight: 600; color: #57503c;
  background: rgba(250, 249, 246, 0.85); padding: 1px 5px; border-radius: 4px; }
/* The hover card - scouting information beside the node under the pointer.
   Same translucent idiom as the panels, inert to the pointer, gone cleanly. */
.rp-map3d-popup { position: absolute; left: 0; top: 0; width: max-content;
  max-width: 15rem; padding: 10px 12px; border: 1px solid #e4e1d8;
  border-radius: 10px; background: rgba(250, 249, 246, 0.88);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  will-change: transform; }
.rp-map3d-popup-name { font-size: 13px; font-weight: 600; line-height: 1.3;
  color: #26251f; }
.rp-map3d-popup-meta { display: flex; align-items: center; gap: 6px;
  margin-top: 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; }
.rp-map3d-popup-dot { width: 8px; height: 8px; border-radius: 9999px;
  flex-shrink: 0; }
.rp-map3d-popup-counts { margin-top: 4px; font-size: 12px; color: #57544a; }
.rp-map3d-popup-hint { margin-top: 6px; font-size: 11px; color: #8a8578; }
/* Floating panels sit light over the scene: translucent surface with a
   blurred backdrop so the map glows through, borders kept, no shadow. */
.mm-legend, .mm-card {
  background: rgba(250, 249, 246, 0.78);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%); }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .mm-legend, .mm-card, .rp-map3d-popup { background: rgba(250, 249, 246, 0.96); }
}
.mm-legend { position: absolute; top: 12px; left: 12px; display: flex;
  flex-direction: column; gap: 2px; max-height: calc(100% - 70px); overflow: auto;
  border: 1px solid #e4e1d8; border-radius: 10px; padding: 8px; }
.mm-legend-title { font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  color: #8a8578; text-transform: uppercase; padding: 0 6px 4px; }
.mm-chip { display: flex; align-items: center; gap: 7px; border: 0;
  background: none; font: inherit; font-size: 12px; color: #4a4942;
  padding: 3px 8px; border-radius: 7px; cursor: pointer; text-align: left; }
.mm-chip:hover { background: rgba(0, 0, 0, 0.05); }
.mm-chip[aria-pressed='true'] { background: #33322e; color: #faf9f6; }
.mm-chip[data-dimmed] { opacity: 0.4; }
.mm-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.mm-card { position: absolute; top: 12px; right: 12px; width: 330px;
  max-width: calc(100% - 24px); max-height: calc(100% - 24px); overflow: auto;
  border: 1px solid #e4e1d8; border-radius: 12px; padding: 14px 16px;
  outline: none; }
.mm-card:focus-visible { outline: 2px solid ${Ns}; }
.mm-card h2 { margin: 0 24px 2px 0; font-size: 16px; line-height: 1.25; }
.mm-card-tag { display: inline-block; font-size: 11px; font-weight: 600;
  letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 8px; }
.mm-card-total { font-size: 22px; font-weight: 700; color: #26251f; }
.mm-card-sub { font-size: 12px; color: #8a8578; margin-bottom: 10px; }
.mm-card-close { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px;
  border: 0; border-radius: 8px; background: none; font-size: 16px; line-height: 1;
  color: #8a8578; cursor: pointer; }
.mm-card-close:hover { background: rgba(0, 0, 0, 0.06); color: #33322e; }
.mm-rows { margin: 0; padding: 0; list-style: none; }
.mm-row { display: flex; align-items: baseline; gap: 8px; width: 100%;
  padding: 5px 6px; margin: 0 -6px; border: 0; background: none; font: inherit;
  font-size: 13px; color: #33322e; border-radius: 7px; cursor: pointer; text-align: left; }
.mm-row:hover { background: rgba(0, 0, 0, 0.05); }
.mm-row .mm-dot { align-self: center; }
.mm-row-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.mm-row-amt { font-weight: 600; white-space: nowrap; }
.mm-row-years { font-size: 11px; color: #8a8578; white-space: nowrap; }
.mm-ask { display: block; margin-top: 12px; padding: 8px 12px; border-radius: 9px;
  background: #33322e; color: #faf9f6; font-size: 13px; font-weight: 600;
  text-decoration: none; text-align: center; }
.mm-ask:hover { background: #26251f; }
.mm-zoom { position: absolute; right: 12px; bottom: 12px; display: flex;
  flex-direction: column; gap: 4px; }
.mm-zoom button { width: 34px; height: 34px; border: 1px solid #e4e1d8;
  border-radius: 9px; background: rgba(250, 249, 246, 0.92); font-size: 16px;
  color: #4a4942; cursor: pointer; }
.mm-zoom button:hover { background: #fff; }
.mm-hint { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
  margin: 0; font-size: 11.5px; color: #8a8578; pointer-events: none;
  white-space: nowrap; }
.mm-fallback { display: flex; align-items: center; justify-content: center;
  height: 100%; padding: 24px; text-align: center; color: #57544a; }
@media (prefers-reduced-motion: reduce) {
  .rp-map3d-territory { transition: none; }
}
@media (max-width: 720px) {
  .mm-legend { flex-direction: row; flex-wrap: nowrap; overflow-x: auto;
    max-width: calc(100% - 24px); max-height: none; align-items: center; }
  .mm-legend-title { display: none; }
  .mm-chip { white-space: nowrap; flex: none; }
  .mm-card { top: auto; right: 8px; left: 8px; bottom: 8px; width: auto;
    max-height: 55%; }
  .mm-hint { display: none; }
}
`;function yg(){if(document.getElementById(ch))return;let i=document.createElement("style");i.id=ch,i.textContent=vg,document.head.appendChild(i)}function ee(i,t,e){let n=document.createElement(i);return t&&(n.className=t),e.appendChild(n),n}async function lv(i,t,e={}){yg(),i.classList.add("mm-root");let n=await fetch(t);if(!n.ok)throw new Error(`money map data: HTTP ${n.status} for ${t}`);let s=await n.json();if(!oh()){let R=ee("div","mm-fallback",i);return R.textContent="The 3D money map needs WebGL, which this browser does not offer. The underlying data is available as JSON at "+t,{select:()=>{},destroy:()=>R.remove()}}let r=_g(s),a=new Map(s.nodes.map(R=>[R.id,R])),o=e.askUrl??(R=>`/?ask=${encodeURIComponent(`What has parliament said about ${R}?`)}`),c=ee("canvas","mm-canvas",i);c.tabIndex=0,c.setAttribute("role","application"),c.setAttribute("aria-label","Money map - drag to orbit, pinch or scroll to zoom, click a node for details. With the keyboard: arrows orbit, plus and minus zoom, Enter selects the node nearest the middle, Escape clears the selection.");let l=ee("div","mm-labels",i);l.setAttribute("aria-hidden","true");let u=ee("div","mm-legend",i),d=ee("div","mm-legend-title",u);d.textContent="Industries \xB7 click to isolate";let h=ee("div","mm-card",i);h.tabIndex=-1,h.setAttribute("role","region"),h.setAttribute("aria-label","Details for the selected node"),h.hidden=!0;let p=ee("div","mm-zoom",i),g=(R,B,H)=>{let $=ee("button","",p);return $.type="button",$.textContent=R,$.setAttribute("aria-label",B),$.title=B,$.addEventListener("click",H),$};g("+","Zoom in",()=>w.zoomBy(1.3)),g("\u2212","Zoom out",()=>w.zoomBy(1/1.3)),g("\u2922","Fit the whole map to view",()=>w.fit(!0));let y=ee("p","mm-hint",i);y.textContent=`Drag to orbit \xB7 scroll to zoom \xB7 click a node \u2014 AEC returns ${s.meta?.coverage??"1998\u20132026"}`;let m=null,f=null,w=new Da(c,l,R=>W(R),()=>{c.replaceWith(Object.assign(document.createElement("div"),{className:"mm-fallback",textContent:"The 3D view lost its graphics context. Reload the page to restart it."}))}),A=()=>{let R=i.getBoundingClientRect();if(R.width<1||R.height<1)return 1.5;let B=R.width/R.height;return B<1?.8:B<1.45?1.2:1.9},M="",T=()=>{let R=f===null?r.nodes:r.nodes.filter(nt=>nt.group===f||nt.group==="parties"),B=new Set(R.map(nt=>nt.id)),H=r.edges.filter(nt=>B.has(nt.source)&&B.has(nt.target)),$={nodes:R,edges:H,groupStyles:r.groupStyles,degrees:r.degrees,measure:"resources",layout:"grouped",aspect:A(),centralGroup:"parties"};w.setData($);let j=`${$.aspect}|${f??"*"}`;if(j!==M){let nt=M==="";M=j,w.fit(!nt)}m&&!B.has(m)&&W(null)},b=A(),C=new ResizeObserver(()=>{let R=A();R!==b&&(b=R,T())});C.observe(i);let _=new Map,E=[...qi.keys()].filter(R=>R!=="parties"&&r.groupStyles.has(R));for(let R of E){let B=ee("button","mm-chip",u);B.type="button",B.setAttribute("aria-pressed","false");let H=ee("span","mm-dot",B);H.style.background=Us(R).colour;let $=ee("span","",B);$.textContent=`${R} \xB7 ${r.groupStyles.get(R)?.count??0}`,B.addEventListener("click",()=>{f=f===R?null:R;for(let[j,nt]of _)nt.setAttribute("aria-pressed",String(j===f)),f!==null&&j!==f?nt.setAttribute("data-dimmed",""):nt.removeAttribute("data-dimmed");T()}),_.set(R,B)}let P=(R,B,H,$,j,nt)=>{let ct=ee("li","",R),dt=ee("button","mm-row",ct);if(dt.type="button",nt?dt.addEventListener("click",nt):dt.disabled=!0,B){let Ot=ee("span","mm-dot",dt);Ot.style.background=B}let zt=ee("span","mm-row-name",dt);zt.textContent=H;let $t=ee("span","mm-row-amt",dt);if($t.textContent=$n($),j){let Ot=ee("span","mm-row-years",dt);Ot.textContent=j}},I=R=>{h.innerHTML="";let B=ee("button","mm-card-close",h);B.type="button",B.textContent="\u2715",B.setAttribute("aria-label","Close details"),B.addEventListener("click",()=>W(null));let H=ee("h2","",h);H.textContent=R.label;let $=ee("span","mm-card-tag",h),j=Us(R.group);$.style.color=R.kind==="party"?R.colour??j.ink:j.ink,$.textContent=R.kind==="party"?"political party":R.industry.replace(/_/g," ");let nt=ee("div","mm-card-total",h);nt.textContent=$n(R.total);let ct=ee("div","mm-card-sub",h),dt=hl(R.firstYear,R.lastYear);ct.textContent=R.kind==="party"?`received across ${R.count.toLocaleString()} receipts \xB7 ${dt}`:`given across ${R.count.toLocaleString()} donations \xB7 ${dt}`;let zt=ee("div","mm-legend-title",h),$t=ee("ul","mm-rows",h);if(R.kind==="donor"){zt.textContent="Where it went";let Ot=s.edges.filter(et=>et.source===R.id).sort((et,tt)=>tt.total-et.total);for(let et of Ot){let tt=a.get(et.target);tt&&P($t,tt.colour??"#9AA0A8",tt.label,et.total,hl(et.firstYear,et.lastYear),()=>W(tt.id))}let Y=ee("a","mm-ask",h);Y.href=o(R.industry.replace(/_/g," ")),Y.textContent="What did parliament say about this industry?"}else{zt.textContent="Top donors shown on the map";let Ot=s.edges.filter(Y=>Y.target===R.id).sort((Y,et)=>et.total-Y.total).slice(0,15);for(let Y of Ot){let et=a.get(Y.source);et&&P($t,Us(et.group).colour,et.label,Y.total,hl(Y.firstYear,Y.lastYear),()=>W(et.id))}}},D=()=>{if(h.hidden)return{left:0,right:0,bottom:0};let R=h.getBoundingClientRect(),B=i.getBoundingClientRect();return R.width>=B.width-40?{left:0,right:0,bottom:R.height+16}:{left:0,right:R.width+24,bottom:0}};function W(R){m=R;let B=R?a.get(R)??null:null;w.setEmphasis({selectedId:R,pathEdges:null,pathFrom:null}),B?(I(B),h.hidden=!1,requestAnimationFrame(()=>{h.hidden||(w.setInsets(D()),m&&w.focusOn(m,null))}),h.focus({preventScroll:!0})):(h.hidden=!0,h.innerHTML="",w.setInsets({left:0,right:0,bottom:0})),e.onSelect?.(B)}let X=R=>{R.key==="Escape"&&m&&(W(null),c.focus({preventScroll:!0}),R.stopPropagation())};return i.addEventListener("keydown",X),T(),{select:R=>W(R),destroy:()=>{i.removeEventListener("keydown",X),C.disconnect(),w.dispose();for(let R of[c,l,u,h,p,y])R.remove();i.classList.remove("mm-root")}}}export{Ds as ForceSim3D,Ba as buildDegrees,_g as buildGraph,cl as clusterCentres3D,$n as formatMoney,lv as mountMoneyMap,Oa as radiusFor,Fa as shortLabel,oh as webglAvailable};
/*! Bundled license information:

three/build/three.core.js:
three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2026 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
