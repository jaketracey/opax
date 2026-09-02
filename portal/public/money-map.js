function Wo(i){return i.length>34?`${i.slice(0,32)}\u2026`:i}function Ue(i){let t=Math.abs(i);return t>=1e9?`$${(i/1e9).toFixed(1)}b`:t>=1e6?`$${(i/1e6).toFixed(1)}m`:t>=1e3?`$${Math.round(i/1e3)}k`:`$${Math.round(i)}`}function Xo(i,t){let e=Math.max(0,t);return i==="links"?Math.min(26,5.5+3.6*Math.sqrt(e)):Math.max(7,Math.min(26,6+5.2*Math.log10(1+e)))}function Gs(i){let t=new Map;for(let e of i)t.set(e.source,(t.get(e.source)??0)+1),t.set(e.target,(t.get(e.target)??0)+1);return t}var Jl=0,wa=1,Kl=2;var Ts=1,jl=2,Yi=3,An=0,Te=1,Oe=2,gn=0,li=1,Ta=2,Aa=3,Ca=4,Ql=5;var Gn=100,tc=101,ec=102,nc=103,ic=104,sc=200,rc=201,oc=202,ac=203,ur=204,dr=205,lc=206,cc=207,hc=208,uc=209,dc=210,fc=211,pc=212,mc=213,gc=214,fr=0,pr=1,mr=2,ci=3,gr=4,xr=5,_r=6,vr=7,Ra=0,xc=1,_c=2,rn=0,Ia=1,Pa=2,La=3,Da=4,Na=5,Ua=6,Fa=7;var Oa=300,Zn=301,ui=302,Gr=303,Wr=304,As=306,yr=1e3,fn=1001,br=1002,Ee=1003,vc=1004;var Cs=1005;var we=1006,Xr=1007;var Jn=1008;var Be=1009,Ba=1010,za=1011,$i=1012,qr=1013,on=1014,an=1015,xn=1016,Yr=1017,$r=1018,Zi=1020,ka=35902,Va=35899,Ha=1021,Ga=1022,Qe=1023,pn=1026,Kn=1027,Wa=1028,Zr=1029,jn=1030,Jr=1031;var Kr=1033,Rs=33776,Is=33777,Ps=33778,Ls=33779,jr=35840,Qr=35841,to=35842,eo=35843,no=36196,io=37492,so=37496,ro=37488,oo=37489,Ds=37490,ao=37491,lo=37808,co=37809,ho=37810,uo=37811,fo=37812,po=37813,mo=37814,go=37815,xo=37816,_o=37817,vo=37818,yo=37819,bo=37820,Mo=37821,So=36492,Eo=36494,wo=36495,To=36283,Ao=36284,Ns=36285,Co=36286;var as=2300,Mr=2301,hr=2302,pa=2303,ma=2400,ga=2401,xa=2402;var yc=3200;var Ro=0,bc=1,In="",He="srgb",ls="srgb-linear",cs="linear",ne="srgb";var oi=7680;var _a=519,Mc=512,Sc=513,Ec=514,Io=515,wc=516,Tc=517,Po=518,Ac=519,va=35044;var Xa="300 es",sn=2e3,Di=2001;function Lh(i){for(let t=i.length-1;t>=0;--t)if(i[t]>=65535)return!0;return!1}function Dh(i){return ArrayBuffer.isView(i)&&!(i instanceof DataView)}function hs(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function Cc(){let i=hs("canvas");return i.style.display="block",i}var Al={},Ni=null;function qa(...i){let t="THREE."+i.shift();Ni?Ni("log",t,...i):console.log(t,...i)}function Rc(i){let t=i[0];if(typeof t=="string"&&t.startsWith("TSL:")){let e=i[1];e&&e.isStackTrace?i[0]+=" "+e.getLocation():i[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return i}function Ft(...i){i=Rc(i);let t="THREE."+i.shift();if(Ni)Ni("warn",t,...i);else{let e=i[0];e&&e.isStackTrace?console.warn(e.getError(t)):console.warn(t,...i)}}function zt(...i){i=Rc(i);let t="THREE."+i.shift();if(Ni)Ni("error",t,...i);else{let e=i[0];e&&e.isStackTrace?console.error(e.getError(t)):console.error(t,...i)}}function ai(...i){let t=i.join(" ");t in Al||(Al[t]=!0,Ft(...i))}function Ic(i,t,e){return new Promise(function(n,s){function r(){switch(i.clientWaitSync(t,i.SYNC_FLUSH_COMMANDS_BIT,0)){case i.WAIT_FAILED:s();break;case i.TIMEOUT_EXPIRED:setTimeout(r,e);break;default:n()}}setTimeout(r,e)})}var Pc={[fr]:pr,[mr]:_r,[gr]:vr,[ci]:xr,[pr]:fr,[_r]:mr,[vr]:gr,[xr]:ci},mn=class{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){let n=this._listeners;return n===void 0?!1:n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){let n=this._listeners;if(n===void 0)return;let s=n[t];if(s!==void 0){let r=s.indexOf(e);r!==-1&&s.splice(r,1)}}dispatchEvent(t){let e=this._listeners;if(e===void 0)return;let n=e[t.type];if(n!==void 0){t.target=this;let s=n.slice(0);for(let r=0,o=s.length;r<o;r++)s[r].call(this,t);t.target=null}}},Ce=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],Cl=1234567,rs=Math.PI/180,Ui=180/Math.PI;function Ji(){let i=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(Ce[i&255]+Ce[i>>8&255]+Ce[i>>16&255]+Ce[i>>24&255]+"-"+Ce[t&255]+Ce[t>>8&255]+"-"+Ce[t>>16&15|64]+Ce[t>>24&255]+"-"+Ce[e&63|128]+Ce[e>>8&255]+"-"+Ce[e>>16&255]+Ce[e>>24&255]+Ce[n&255]+Ce[n>>8&255]+Ce[n>>16&255]+Ce[n>>24&255]).toLowerCase()}function Qt(i,t,e){return Math.max(t,Math.min(e,i))}function Ya(i,t){return(i%t+t)%t}function Nh(i,t,e,n,s){return n+(i-t)*(s-n)/(e-t)}function Uh(i,t,e){return i!==t?(e-i)/(t-i):0}function os(i,t,e){return(1-e)*i+e*t}function Fh(i,t,e,n){return os(i,t,1-Math.exp(-e*n))}function Oh(i,t=1){return t-Math.abs(Ya(i,t*2)-t)}function Bh(i,t,e){return i<=t?0:i>=e?1:(i=(i-t)/(e-t),i*i*(3-2*i))}function zh(i,t,e){return i<=t?0:i>=e?1:(i=(i-t)/(e-t),i*i*i*(i*(i*6-15)+10))}function kh(i,t){return i+Math.floor(Math.random()*(t-i+1))}function Vh(i,t){return i+Math.random()*(t-i)}function Hh(i){return i*(.5-Math.random())}function Gh(i){i!==void 0&&(Cl=i);let t=Cl+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}function Wh(i){return i*rs}function Xh(i){return i*Ui}function qh(i){return(i&i-1)===0&&i!==0}function Yh(i){return Math.pow(2,Math.ceil(Math.log(i)/Math.LN2))}function $h(i){return Math.pow(2,Math.floor(Math.log(i)/Math.LN2))}function Zh(i,t,e,n,s){let r=Math.cos,o=Math.sin,a=r(e/2),l=o(e/2),c=r((t+n)/2),h=o((t+n)/2),d=r((t-n)/2),u=o((t-n)/2),f=r((n-t)/2),g=o((n-t)/2);switch(s){case"XYX":i.set(a*h,l*d,l*u,a*c);break;case"YZY":i.set(l*u,a*h,l*d,a*c);break;case"ZXZ":i.set(l*d,l*u,a*h,a*c);break;case"XZX":i.set(a*h,l*g,l*f,a*c);break;case"YXY":i.set(l*f,a*h,l*g,a*c);break;case"ZYZ":i.set(l*g,l*f,a*h,a*c);break;default:Ft("MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+s)}}function Pi(i,t){switch(t.constructor){case Float32Array:return i;case Uint32Array:return i/4294967295;case Uint16Array:return i/65535;case Uint8Array:return i/255;case Int32Array:return Math.max(i/2147483647,-1);case Int16Array:return Math.max(i/32767,-1);case Int8Array:return Math.max(i/127,-1);default:throw new Error("THREE.MathUtils: Invalid component type.")}}function De(i,t){switch(t.constructor){case Float32Array:return i;case Uint32Array:return Math.round(i*4294967295);case Uint16Array:return Math.round(i*65535);case Uint8Array:return Math.round(i*255);case Int32Array:return Math.round(i*2147483647);case Int16Array:return Math.round(i*32767);case Int8Array:return Math.round(i*127);default:throw new Error("THREE.MathUtils: Invalid component type.")}}var Qn={DEG2RAD:rs,RAD2DEG:Ui,generateUUID:Ji,clamp:Qt,euclideanModulo:Ya,mapLinear:Nh,inverseLerp:Uh,lerp:os,damp:Fh,pingpong:Oh,smoothstep:Bh,smootherstep:zh,randInt:kh,randFloat:Vh,randFloatSpread:Hh,seededRandom:Gh,degToRad:Wh,radToDeg:Xh,isPowerOfTwo:qh,ceilPowerOfTwo:Yh,floorPowerOfTwo:$h,setQuaternionFromProperEuler:Zh,normalize:De,denormalize:Pi},Yt=class i{static{i.prototype.isVector2=!0}constructor(t=0,e=0){this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("THREE.Vector2: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){let e=this.x,n=this.y,s=t.elements;return this.x=s[0]*e+s[3]*n+s[6],this.y=s[1]*e+s[4]*n+s[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=Qt(this.x,t.x,e.x),this.y=Qt(this.y,t.y,e.y),this}clampScalar(t,e){return this.x=Qt(this.x,t,e),this.y=Qt(this.y,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Qt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(Qt(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){let n=Math.cos(e),s=Math.sin(e),r=this.x-t.x,o=this.y-t.y;return this.x=r*n-o*s+t.x,this.y=r*s+o*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},je=class{constructor(t=0,e=0,n=0,s=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=s}static slerpFlat(t,e,n,s,r,o,a){let l=n[s+0],c=n[s+1],h=n[s+2],d=n[s+3],u=r[o+0],f=r[o+1],g=r[o+2],v=r[o+3];if(d!==v||l!==u||c!==f||h!==g){let m=l*u+c*f+h*g+d*v;m<0&&(u=-u,f=-f,g=-g,v=-v,m=-m);let p=1-a;if(m<.9995){let E=Math.acos(m),C=Math.sin(E);p=Math.sin(p*E)/C,a=Math.sin(a*E)/C,l=l*p+u*a,c=c*p+f*a,h=h*p+g*a,d=d*p+v*a}else{l=l*p+u*a,c=c*p+f*a,h=h*p+g*a,d=d*p+v*a;let E=1/Math.sqrt(l*l+c*c+h*h+d*d);l*=E,c*=E,h*=E,d*=E}}t[e]=l,t[e+1]=c,t[e+2]=h,t[e+3]=d}static multiplyQuaternionsFlat(t,e,n,s,r,o){let a=n[s],l=n[s+1],c=n[s+2],h=n[s+3],d=r[o],u=r[o+1],f=r[o+2],g=r[o+3];return t[e]=a*g+h*d+l*f-c*u,t[e+1]=l*g+h*u+c*d-a*f,t[e+2]=c*g+h*f+a*u-l*d,t[e+3]=h*g-a*d-l*u-c*f,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,s){return this._x=t,this._y=e,this._z=n,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){let n=t._x,s=t._y,r=t._z,o=t._order,a=Math.cos,l=Math.sin,c=a(n/2),h=a(s/2),d=a(r/2),u=l(n/2),f=l(s/2),g=l(r/2);switch(o){case"XYZ":this._x=u*h*d+c*f*g,this._y=c*f*d-u*h*g,this._z=c*h*g+u*f*d,this._w=c*h*d-u*f*g;break;case"YXZ":this._x=u*h*d+c*f*g,this._y=c*f*d-u*h*g,this._z=c*h*g-u*f*d,this._w=c*h*d+u*f*g;break;case"ZXY":this._x=u*h*d-c*f*g,this._y=c*f*d+u*h*g,this._z=c*h*g+u*f*d,this._w=c*h*d-u*f*g;break;case"ZYX":this._x=u*h*d-c*f*g,this._y=c*f*d+u*h*g,this._z=c*h*g-u*f*d,this._w=c*h*d+u*f*g;break;case"YZX":this._x=u*h*d+c*f*g,this._y=c*f*d+u*h*g,this._z=c*h*g-u*f*d,this._w=c*h*d-u*f*g;break;case"XZY":this._x=u*h*d-c*f*g,this._y=c*f*d-u*h*g,this._z=c*h*g+u*f*d,this._w=c*h*d+u*f*g;break;default:Ft("Quaternion: .setFromEuler() encountered an unknown order: "+o)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){let n=e/2,s=Math.sin(n);return this._x=t.x*s,this._y=t.y*s,this._z=t.z*s,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){let e=t.elements,n=e[0],s=e[4],r=e[8],o=e[1],a=e[5],l=e[9],c=e[2],h=e[6],d=e[10],u=n+a+d;if(u>0){let f=.5/Math.sqrt(u+1);this._w=.25/f,this._x=(h-l)*f,this._y=(r-c)*f,this._z=(o-s)*f}else if(n>a&&n>d){let f=2*Math.sqrt(1+n-a-d);this._w=(h-l)/f,this._x=.25*f,this._y=(s+o)/f,this._z=(r+c)/f}else if(a>d){let f=2*Math.sqrt(1+a-n-d);this._w=(r-c)/f,this._x=(s+o)/f,this._y=.25*f,this._z=(l+h)/f}else{let f=2*Math.sqrt(1+d-n-a);this._w=(o-s)/f,this._x=(r+c)/f,this._y=(l+h)/f,this._z=.25*f}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<1e-8?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(Qt(this.dot(t),-1,1)))}rotateTowards(t,e){let n=this.angleTo(t);if(n===0)return this;let s=Math.min(1,e/n);return this.slerp(t,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){let n=t._x,s=t._y,r=t._z,o=t._w,a=e._x,l=e._y,c=e._z,h=e._w;return this._x=n*h+o*a+s*c-r*l,this._y=s*h+o*l+r*a-n*c,this._z=r*h+o*c+n*l-s*a,this._w=o*h-n*a-s*l-r*c,this._onChangeCallback(),this}slerp(t,e){let n=t._x,s=t._y,r=t._z,o=t._w,a=this.dot(t);a<0&&(n=-n,s=-s,r=-r,o=-o,a=-a);let l=1-e;if(a<.9995){let c=Math.acos(a),h=Math.sin(c);l=Math.sin(l*c)/h,e=Math.sin(e*c)/h,this._x=this._x*l+n*e,this._y=this._y*l+s*e,this._z=this._z*l+r*e,this._w=this._w*l+o*e,this._onChangeCallback()}else this._x=this._x*l+n*e,this._y=this._y*l+s*e,this._z=this._z*l+r*e,this._w=this._w*l+o*e,this.normalize();return this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){let t=2*Math.PI*Math.random(),e=2*Math.PI*Math.random(),n=Math.random(),s=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(s*Math.sin(t),s*Math.cos(t),r*Math.sin(e),r*Math.cos(e))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},N=class i{static{i.prototype.isVector3=!0}constructor(t=0,e=0,n=0){this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("THREE.Vector3: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(Rl.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(Rl.setFromAxisAngle(t,e))}applyMatrix3(t){let e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[3]*n+r[6]*s,this.y=r[1]*e+r[4]*n+r[7]*s,this.z=r[2]*e+r[5]*n+r[8]*s,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){let e=this.x,n=this.y,s=this.z,r=t.elements,o=1/(r[3]*e+r[7]*n+r[11]*s+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*s+r[12])*o,this.y=(r[1]*e+r[5]*n+r[9]*s+r[13])*o,this.z=(r[2]*e+r[6]*n+r[10]*s+r[14])*o,this}applyQuaternion(t){let e=this.x,n=this.y,s=this.z,r=t.x,o=t.y,a=t.z,l=t.w,c=2*(o*s-a*n),h=2*(a*e-r*s),d=2*(r*n-o*e);return this.x=e+l*c+o*d-a*h,this.y=n+l*h+a*c-r*d,this.z=s+l*d+r*h-o*c,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){let e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*s,this.y=r[1]*e+r[5]*n+r[9]*s,this.z=r[2]*e+r[6]*n+r[10]*s,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=Qt(this.x,t.x,e.x),this.y=Qt(this.y,t.y,e.y),this.z=Qt(this.z,t.z,e.z),this}clampScalar(t,e){return this.x=Qt(this.x,t,e),this.y=Qt(this.y,t,e),this.z=Qt(this.z,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Qt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){let n=t.x,s=t.y,r=t.z,o=e.x,a=e.y,l=e.z;return this.x=s*l-r*a,this.y=r*o-n*l,this.z=n*a-s*o,this}projectOnVector(t){let e=t.lengthSq();if(e===0)return this.set(0,0,0);let n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return qo.copy(this).projectOnVector(t),this.sub(qo)}reflect(t){return this.sub(qo.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(Qt(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y,s=this.z-t.z;return e*e+n*n+s*s}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){let s=Math.sin(e)*t;return this.x=s*Math.sin(n),this.y=Math.cos(e)*t,this.z=s*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){let e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),s=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=s,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let t=Math.random()*Math.PI*2,e=Math.random()*2-1,n=Math.sqrt(1-e*e);return this.x=n*Math.cos(t),this.y=e,this.z=n*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},qo=new N,Rl=new je,Ht=class i{static{i.prototype.isMatrix3=!0}constructor(t,e,n,s,r,o,a,l,c){this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,o,a,l,c)}set(t,e,n,s,r,o,a,l,c){let h=this.elements;return h[0]=t,h[1]=s,h[2]=a,h[3]=e,h[4]=r,h[5]=l,h[6]=n,h[7]=o,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){let e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,s=e.elements,r=this.elements,o=n[0],a=n[3],l=n[6],c=n[1],h=n[4],d=n[7],u=n[2],f=n[5],g=n[8],v=s[0],m=s[3],p=s[6],E=s[1],C=s[4],S=s[7],y=s[2],M=s[5],T=s[8];return r[0]=o*v+a*E+l*y,r[3]=o*m+a*C+l*M,r[6]=o*p+a*S+l*T,r[1]=c*v+h*E+d*y,r[4]=c*m+h*C+d*M,r[7]=c*p+h*S+d*T,r[2]=u*v+f*E+g*y,r[5]=u*m+f*C+g*M,r[8]=u*p+f*S+g*T,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],h=t[8];return e*o*h-e*a*c-n*r*h+n*a*l+s*r*c-s*o*l}invert(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],h=t[8],d=h*o-a*c,u=a*l-h*r,f=c*r-o*l,g=e*d+n*u+s*f;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);let v=1/g;return t[0]=d*v,t[1]=(s*c-h*n)*v,t[2]=(a*n-s*o)*v,t[3]=u*v,t[4]=(h*e-s*l)*v,t[5]=(s*r-a*e)*v,t[6]=f*v,t[7]=(n*l-c*e)*v,t[8]=(o*e-n*r)*v,this}transpose(){let t,e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){let e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,s,r,o,a){let l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*o+c*a)+o+t,-s*c,s*l,-s*(-c*o+l*a)+a+e,0,0,1),this}scale(t,e){return ai("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(Yo.makeScale(t,e)),this}rotate(t){return ai("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(Yo.makeRotation(-t)),this}translate(t,e){return ai("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(Yo.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){let e=this.elements,n=t.elements;for(let s=0;s<9;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}},Yo=new Ht,Il=new Ht().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Pl=new Ht().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function Jh(){let i={enabled:!0,workingColorSpace:ls,spaces:{},convert:function(s,r,o){return this.enabled===!1||r===o||!r||!o||(this.spaces[r].transfer===ne&&(s.r=Tn(s.r),s.g=Tn(s.g),s.b=Tn(s.b)),this.spaces[r].primaries!==this.spaces[o].primaries&&(s.applyMatrix3(this.spaces[r].toXYZ),s.applyMatrix3(this.spaces[o].fromXYZ)),this.spaces[o].transfer===ne&&(s.r=Li(s.r),s.g=Li(s.g),s.b=Li(s.b))),s},workingToColorSpace:function(s,r){return this.convert(s,this.workingColorSpace,r)},colorSpaceToWorking:function(s,r){return this.convert(s,r,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===In?cs:this.spaces[s].transfer},getToneMappingMode:function(s){return this.spaces[s].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(s,r=this.workingColorSpace){return s.fromArray(this.spaces[r].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,r,o){return s.copy(this.spaces[r].toXYZ).multiply(this.spaces[o].fromXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(s,r){return ai("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),i.workingToColorSpace(s,r)},toWorkingColorSpace:function(s,r){return ai("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),i.colorSpaceToWorking(s,r)}},t=[.64,.33,.3,.6,.15,.06],e=[.2126,.7152,.0722],n=[.3127,.329];return i.define({[ls]:{primaries:t,whitePoint:n,transfer:cs,toXYZ:Il,fromXYZ:Pl,luminanceCoefficients:e,workingColorSpaceConfig:{unpackColorSpace:He},outputColorSpaceConfig:{drawingBufferColorSpace:He}},[He]:{primaries:t,whitePoint:n,transfer:ne,toXYZ:Il,fromXYZ:Pl,luminanceCoefficients:e,outputColorSpaceConfig:{drawingBufferColorSpace:He}}}),i}var jt=Jh();function Tn(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function Li(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}var vi,Sr=class{static getDataURL(t,e="image/png"){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let n;if(t instanceof HTMLCanvasElement)n=t;else{vi===void 0&&(vi=hs("canvas")),vi.width=t.width,vi.height=t.height;let s=vi.getContext("2d");t instanceof ImageData?s.putImageData(t,0,0):s.drawImage(t,0,0,t.width,t.height),n=vi}return n.toDataURL(e)}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){let e=hs("canvas");e.width=t.width,e.height=t.height;let n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);let s=n.getImageData(0,0,t.width,t.height),r=s.data;for(let o=0;o<r.length;o++)r[o]=Tn(r[o]/255)*255;return n.putImageData(s,0,0),e}else if(t.data){let e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(Tn(e[n]/255)*255):e[n]=Tn(e[n]);return{data:e,width:t.width,height:t.height}}else return Ft("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}},Kh=0,Fi=class{constructor(t=null){this.isSource=!0,Object.defineProperty(this,"id",{value:Kh++}),this.uuid=Ji(),this.data=t,this.dataReady=!0,this.version=0}getSize(t){let e=this.data;return typeof HTMLVideoElement<"u"&&e instanceof HTMLVideoElement?t.set(e.videoWidth,e.videoHeight,0):typeof VideoFrame<"u"&&e instanceof VideoFrame?t.set(e.displayWidth,e.displayHeight,0):e!==null?t.set(e.width,e.height,e.depth||0):t.set(0,0,0),t}set needsUpdate(t){t===!0&&this.version++}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];let n={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let o=0,a=s.length;o<a;o++)s[o].isDataTexture?r.push($o(s[o].image)):r.push($o(s[o]))}else r=$o(s);n.url=r}return e||(t.images[this.uuid]=n),n}};function $o(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?Sr.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(Ft("Texture: Unable to serialize Texture."),{})}var jh=0,Zo=new N,Fe=class i extends mn{constructor(t=i.DEFAULT_IMAGE,e=i.DEFAULT_MAPPING,n=fn,s=fn,r=we,o=Jn,a=Qe,l=Be,c=i.DEFAULT_ANISOTROPY,h=In){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:jh++}),this.uuid=Ji(),this.name="",this.source=new Fi(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=s,this.magFilter=r,this.minFilter=o,this.anisotropy=c,this.format=a,this.internalFormat=null,this.type=l,this.offset=new Yt(0,0),this.repeat=new Yt(1,1),this.center=new Yt(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Ht,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(Zo).x}get height(){return this.source.getSize(Zo).y}get depth(){return this.source.getSize(Zo).z}get image(){return this.source.data}set image(t){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.normalized=t.normalized,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.renderTarget=t.renderTarget,this.isRenderTargetTexture=t.isRenderTargetTexture,this.isArrayTexture=t.isArrayTexture,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}setValues(t){for(let e in t){let n=t[e];if(n===void 0){Ft(`Texture.setValues(): parameter '${e}' has value of undefined.`);continue}let s=this[e];if(s===void 0){Ft(`Texture.setValues(): property '${e}' does not exist.`);continue}s&&n&&s.isVector2&&n.isVector2||s&&n&&s.isVector3&&n.isVector3||s&&n&&s.isMatrix3&&n.isMatrix3?s.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];let n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==Oa)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case yr:t.x=t.x-Math.floor(t.x);break;case fn:t.x=t.x<0?0:1;break;case br:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case yr:t.y=t.y-Math.floor(t.y);break;case fn:t.y=t.y<0?0:1;break;case br:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}};Fe.DEFAULT_IMAGE=null;Fe.DEFAULT_MAPPING=Oa;Fe.DEFAULT_ANISOTROPY=1;var pe=class i{static{i.prototype.isVector4=!0}constructor(t=0,e=0,n=0,s=1){this.x=t,this.y=e,this.z=n,this.w=s}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,s){return this.x=t,this.y=e,this.z=n,this.w=s,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("THREE.Vector4: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){let e=this.x,n=this.y,s=this.z,r=this.w,o=t.elements;return this.x=o[0]*e+o[4]*n+o[8]*s+o[12]*r,this.y=o[1]*e+o[5]*n+o[9]*s+o[13]*r,this.z=o[2]*e+o[6]*n+o[10]*s+o[14]*r,this.w=o[3]*e+o[7]*n+o[11]*s+o[15]*r,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);let e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,s,r,l=t.elements,c=l[0],h=l[4],d=l[8],u=l[1],f=l[5],g=l[9],v=l[2],m=l[6],p=l[10];if(Math.abs(h-u)<.01&&Math.abs(d-v)<.01&&Math.abs(g-m)<.01){if(Math.abs(h+u)<.1&&Math.abs(d+v)<.1&&Math.abs(g+m)<.1&&Math.abs(c+f+p-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;let C=(c+1)/2,S=(f+1)/2,y=(p+1)/2,M=(h+u)/4,T=(d+v)/4,x=(g+m)/4;return C>S&&C>y?C<.01?(n=0,s=.707106781,r=.707106781):(n=Math.sqrt(C),s=M/n,r=T/n):S>y?S<.01?(n=.707106781,s=0,r=.707106781):(s=Math.sqrt(S),n=M/s,r=x/s):y<.01?(n=.707106781,s=.707106781,r=0):(r=Math.sqrt(y),n=T/r,s=x/r),this.set(n,s,r,e),this}let E=Math.sqrt((m-g)*(m-g)+(d-v)*(d-v)+(u-h)*(u-h));return Math.abs(E)<.001&&(E=1),this.x=(m-g)/E,this.y=(d-v)/E,this.z=(u-h)/E,this.w=Math.acos((c+f+p-1)/2),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this.w=e[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=Qt(this.x,t.x,e.x),this.y=Qt(this.y,t.y,e.y),this.z=Qt(this.z,t.z,e.z),this.w=Qt(this.w,t.w,e.w),this}clampScalar(t,e){return this.x=Qt(this.x,t,e),this.y=Qt(this.y,t,e),this.z=Qt(this.z,t,e),this.w=Qt(this.w,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Qt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},Er=class extends mn{constructor(t=1,e=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:we,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=t,this.height=e,this.depth=n.depth,this.scissor=new pe(0,0,t,e),this.scissorTest=!1,this.viewport=new pe(0,0,t,e),this.textures=[];let s={width:t,height:e,depth:n.depth},r=new Fe(s),o=n.count;for(let a=0;a<o;a++)this.textures[a]=r.clone(),this.textures[a].isRenderTargetTexture=!0,this.textures[a].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(t={}){let e={minFilter:we,generateMipmaps:!1,flipY:!1,internalFormat:null};t.mapping!==void 0&&(e.mapping=t.mapping),t.wrapS!==void 0&&(e.wrapS=t.wrapS),t.wrapT!==void 0&&(e.wrapT=t.wrapT),t.wrapR!==void 0&&(e.wrapR=t.wrapR),t.magFilter!==void 0&&(e.magFilter=t.magFilter),t.minFilter!==void 0&&(e.minFilter=t.minFilter),t.format!==void 0&&(e.format=t.format),t.type!==void 0&&(e.type=t.type),t.anisotropy!==void 0&&(e.anisotropy=t.anisotropy),t.colorSpace!==void 0&&(e.colorSpace=t.colorSpace),t.flipY!==void 0&&(e.flipY=t.flipY),t.generateMipmaps!==void 0&&(e.generateMipmaps=t.generateMipmaps),t.internalFormat!==void 0&&(e.internalFormat=t.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(e)}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}set depthTexture(t){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),t!==null&&(t.renderTarget=this),this._depthTexture=t}get depthTexture(){return this._depthTexture}setSize(t,e,n=1){if(this.width!==t||this.height!==e||this.depth!==n){this.width=t,this.height=e,this.depth=n;for(let s=0,r=this.textures.length;s<r;s++)this.textures[s].image.width=t,this.textures[s].image.height=e,this.textures[s].image.depth=n,this.textures[s].isData3DTexture!==!0&&(this.textures[s].isArrayTexture=this.textures[s].image.depth>1);this.dispose()}this.viewport.set(0,0,t,e),this.scissor.set(0,0,t,e)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let e=0,n=t.textures.length;e<n;e++){this.textures[e]=t.textures[e].clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;let s=Object.assign({},t.textures[e].image);this.textures[e].source=new Fi(s)}return this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,t.depthTexture!==null&&(this.depthTexture=t.depthTexture.clone()),this.samples=t.samples,this.multiview=t.multiview,this.useArrayDepthTexture=t.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}},Xe=class extends Er{constructor(t=1,e=1,n={}){super(t,e,n),this.isWebGLRenderTarget=!0}},us=class extends Fe{constructor(t=null,e=1,n=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=Ee,this.minFilter=Ee,this.wrapR=fn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}};var wr=class extends Fe{constructor(t=null,e=1,n=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=Ee,this.minFilter=Ee,this.wrapR=fn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var fe=class i{static{i.prototype.isMatrix4=!0}constructor(t,e,n,s,r,o,a,l,c,h,d,u,f,g,v,m){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,o,a,l,c,h,d,u,f,g,v,m)}set(t,e,n,s,r,o,a,l,c,h,d,u,f,g,v,m){let p=this.elements;return p[0]=t,p[4]=e,p[8]=n,p[12]=s,p[1]=r,p[5]=o,p[9]=a,p[13]=l,p[2]=c,p[6]=h,p[10]=d,p[14]=u,p[3]=f,p[7]=g,p[11]=v,p[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new i().fromArray(this.elements)}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){let e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){let e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return this.determinantAffine()===0?(t.set(1,0,0),e.set(0,1,0),n.set(0,0,1),this):(t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){if(t.determinantAffine()===0)return this.identity();let e=this.elements,n=t.elements,s=1/yi.setFromMatrixColumn(t,0).length(),r=1/yi.setFromMatrixColumn(t,1).length(),o=1/yi.setFromMatrixColumn(t,2).length();return e[0]=n[0]*s,e[1]=n[1]*s,e[2]=n[2]*s,e[3]=0,e[4]=n[4]*r,e[5]=n[5]*r,e[6]=n[6]*r,e[7]=0,e[8]=n[8]*o,e[9]=n[9]*o,e[10]=n[10]*o,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){let e=this.elements,n=t.x,s=t.y,r=t.z,o=Math.cos(n),a=Math.sin(n),l=Math.cos(s),c=Math.sin(s),h=Math.cos(r),d=Math.sin(r);if(t.order==="XYZ"){let u=o*h,f=o*d,g=a*h,v=a*d;e[0]=l*h,e[4]=-l*d,e[8]=c,e[1]=f+g*c,e[5]=u-v*c,e[9]=-a*l,e[2]=v-u*c,e[6]=g+f*c,e[10]=o*l}else if(t.order==="YXZ"){let u=l*h,f=l*d,g=c*h,v=c*d;e[0]=u+v*a,e[4]=g*a-f,e[8]=o*c,e[1]=o*d,e[5]=o*h,e[9]=-a,e[2]=f*a-g,e[6]=v+u*a,e[10]=o*l}else if(t.order==="ZXY"){let u=l*h,f=l*d,g=c*h,v=c*d;e[0]=u-v*a,e[4]=-o*d,e[8]=g+f*a,e[1]=f+g*a,e[5]=o*h,e[9]=v-u*a,e[2]=-o*c,e[6]=a,e[10]=o*l}else if(t.order==="ZYX"){let u=o*h,f=o*d,g=a*h,v=a*d;e[0]=l*h,e[4]=g*c-f,e[8]=u*c+v,e[1]=l*d,e[5]=v*c+u,e[9]=f*c-g,e[2]=-c,e[6]=a*l,e[10]=o*l}else if(t.order==="YZX"){let u=o*l,f=o*c,g=a*l,v=a*c;e[0]=l*h,e[4]=v-u*d,e[8]=g*d+f,e[1]=d,e[5]=o*h,e[9]=-a*h,e[2]=-c*h,e[6]=f*d+g,e[10]=u-v*d}else if(t.order==="XZY"){let u=o*l,f=o*c,g=a*l,v=a*c;e[0]=l*h,e[4]=-d,e[8]=c*h,e[1]=u*d+v,e[5]=o*h,e[9]=f*d-g,e[2]=g*d-f,e[6]=a*h,e[10]=v*d+u}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(Qh,t,tu)}lookAt(t,e,n){let s=this.elements;return ke.subVectors(t,e),ke.lengthSq()===0&&(ke.z=1),ke.normalize(),Fn.crossVectors(n,ke),Fn.lengthSq()===0&&(Math.abs(n.z)===1?ke.x+=1e-4:ke.z+=1e-4,ke.normalize(),Fn.crossVectors(n,ke)),Fn.normalize(),Ws.crossVectors(ke,Fn),s[0]=Fn.x,s[4]=Ws.x,s[8]=ke.x,s[1]=Fn.y,s[5]=Ws.y,s[9]=ke.y,s[2]=Fn.z,s[6]=Ws.z,s[10]=ke.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,s=e.elements,r=this.elements,o=n[0],a=n[4],l=n[8],c=n[12],h=n[1],d=n[5],u=n[9],f=n[13],g=n[2],v=n[6],m=n[10],p=n[14],E=n[3],C=n[7],S=n[11],y=n[15],M=s[0],T=s[4],x=s[8],w=s[12],R=s[1],I=s[5],D=s[9],X=s[13],W=s[2],L=s[6],k=s[10],z=s[14],Z=s[3],tt=s[7],rt=s[11],st=s[15];return r[0]=o*M+a*R+l*W+c*Z,r[4]=o*T+a*I+l*L+c*tt,r[8]=o*x+a*D+l*k+c*rt,r[12]=o*w+a*X+l*z+c*st,r[1]=h*M+d*R+u*W+f*Z,r[5]=h*T+d*I+u*L+f*tt,r[9]=h*x+d*D+u*k+f*rt,r[13]=h*w+d*X+u*z+f*st,r[2]=g*M+v*R+m*W+p*Z,r[6]=g*T+v*I+m*L+p*tt,r[10]=g*x+v*D+m*k+p*rt,r[14]=g*w+v*X+m*z+p*st,r[3]=E*M+C*R+S*W+y*Z,r[7]=E*T+C*I+S*L+y*tt,r[11]=E*x+C*D+S*k+y*rt,r[15]=E*w+C*X+S*z+y*st,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[4],s=t[8],r=t[12],o=t[1],a=t[5],l=t[9],c=t[13],h=t[2],d=t[6],u=t[10],f=t[14],g=t[3],v=t[7],m=t[11],p=t[15],E=l*f-c*u,C=a*f-c*d,S=a*u-l*d,y=o*f-c*h,M=o*u-l*h,T=o*d-a*h;return e*(v*E-m*C+p*S)-n*(g*E-m*y+p*M)+s*(g*C-v*y+p*T)-r*(g*S-v*M+m*T)}determinantAffine(){let t=this.elements,e=t[0],n=t[4],s=t[8],r=t[1],o=t[5],a=t[9],l=t[2],c=t[6],h=t[10];return e*(o*h-a*c)-n*(r*h-a*l)+s*(r*c-o*l)}transpose(){let t=this.elements,e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){let s=this.elements;return t.isVector3?(s[12]=t.x,s[13]=t.y,s[14]=t.z):(s[12]=t,s[13]=e,s[14]=n),this}invert(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],h=t[8],d=t[9],u=t[10],f=t[11],g=t[12],v=t[13],m=t[14],p=t[15],E=e*a-n*o,C=e*l-s*o,S=e*c-r*o,y=n*l-s*a,M=n*c-r*a,T=s*c-r*l,x=h*v-d*g,w=h*m-u*g,R=h*p-f*g,I=d*m-u*v,D=d*p-f*v,X=u*p-f*m,W=E*X-C*D+S*I+y*R-M*w+T*x;if(W===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let L=1/W;return t[0]=(a*X-l*D+c*I)*L,t[1]=(s*D-n*X-r*I)*L,t[2]=(v*T-m*M+p*y)*L,t[3]=(u*M-d*T-f*y)*L,t[4]=(l*R-o*X-c*w)*L,t[5]=(e*X-s*R+r*w)*L,t[6]=(m*S-g*T-p*C)*L,t[7]=(h*T-u*S+f*C)*L,t[8]=(o*D-a*R+c*x)*L,t[9]=(n*R-e*D-r*x)*L,t[10]=(g*M-v*S+p*E)*L,t[11]=(d*S-h*M-f*E)*L,t[12]=(a*w-o*I-l*x)*L,t[13]=(e*I-n*w+s*x)*L,t[14]=(v*C-g*y-m*E)*L,t[15]=(h*y-d*C+u*E)*L,this}scale(t){let e=this.elements,n=t.x,s=t.y,r=t.z;return e[0]*=n,e[4]*=s,e[8]*=r,e[1]*=n,e[5]*=s,e[9]*=r,e[2]*=n,e[6]*=s,e[10]*=r,e[3]*=n,e[7]*=s,e[11]*=r,this}getMaxScaleOnAxis(){let t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],s=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,s))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){let e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){let n=Math.cos(e),s=Math.sin(e),r=1-n,o=t.x,a=t.y,l=t.z,c=r*o,h=r*a;return this.set(c*o+n,c*a-s*l,c*l+s*a,0,c*a+s*l,h*a+n,h*l-s*o,0,c*l-s*a,h*l+s*o,r*l*l+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,s,r,o){return this.set(1,n,r,0,t,1,o,0,e,s,1,0,0,0,0,1),this}compose(t,e,n){let s=this.elements,r=e._x,o=e._y,a=e._z,l=e._w,c=r+r,h=o+o,d=a+a,u=r*c,f=r*h,g=r*d,v=o*h,m=o*d,p=a*d,E=l*c,C=l*h,S=l*d,y=n.x,M=n.y,T=n.z;return s[0]=(1-(v+p))*y,s[1]=(f+S)*y,s[2]=(g-C)*y,s[3]=0,s[4]=(f-S)*M,s[5]=(1-(u+p))*M,s[6]=(m+E)*M,s[7]=0,s[8]=(g+C)*T,s[9]=(m-E)*T,s[10]=(1-(u+v))*T,s[11]=0,s[12]=t.x,s[13]=t.y,s[14]=t.z,s[15]=1,this}decompose(t,e,n){let s=this.elements;t.x=s[12],t.y=s[13],t.z=s[14];let r=this.determinantAffine();if(r===0)return n.set(1,1,1),e.identity(),this;let o=yi.set(s[0],s[1],s[2]).length(),a=yi.set(s[4],s[5],s[6]).length(),l=yi.set(s[8],s[9],s[10]).length();r<0&&(o=-o),tn.copy(this);let c=1/o,h=1/a,d=1/l;return tn.elements[0]*=c,tn.elements[1]*=c,tn.elements[2]*=c,tn.elements[4]*=h,tn.elements[5]*=h,tn.elements[6]*=h,tn.elements[8]*=d,tn.elements[9]*=d,tn.elements[10]*=d,e.setFromRotationMatrix(tn),n.x=o,n.y=a,n.z=l,this}makePerspective(t,e,n,s,r,o,a=sn,l=!1){let c=this.elements,h=2*r/(e-t),d=2*r/(n-s),u=(e+t)/(e-t),f=(n+s)/(n-s),g,v;if(l)g=r/(o-r),v=o*r/(o-r);else if(a===sn)g=-(o+r)/(o-r),v=-2*o*r/(o-r);else if(a===Di)g=-o/(o-r),v=-o*r/(o-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return c[0]=h,c[4]=0,c[8]=u,c[12]=0,c[1]=0,c[5]=d,c[9]=f,c[13]=0,c[2]=0,c[6]=0,c[10]=g,c[14]=v,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(t,e,n,s,r,o,a=sn,l=!1){let c=this.elements,h=2/(e-t),d=2/(n-s),u=-(e+t)/(e-t),f=-(n+s)/(n-s),g,v;if(l)g=1/(o-r),v=o/(o-r);else if(a===sn)g=-2/(o-r),v=-(o+r)/(o-r);else if(a===Di)g=-1/(o-r),v=-r/(o-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return c[0]=h,c[4]=0,c[8]=0,c[12]=u,c[1]=0,c[5]=d,c[9]=0,c[13]=f,c[2]=0,c[6]=0,c[10]=g,c[14]=v,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(t){let e=this.elements,n=t.elements;for(let s=0;s<16;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}},yi=new N,tn=new fe,Qh=new N(0,0,0),tu=new N(1,1,1),Fn=new N,Ws=new N,ke=new N,Ll=new fe,Dl=new je,Cn=class i{constructor(t=0,e=0,n=0,s=i.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=s}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,s=this._order){return this._x=t,this._y=e,this._z=n,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){let s=t.elements,r=s[0],o=s[4],a=s[8],l=s[1],c=s[5],h=s[9],d=s[2],u=s[6],f=s[10];switch(e){case"XYZ":this._y=Math.asin(Qt(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-h,f),this._z=Math.atan2(-o,r)):(this._x=Math.atan2(u,c),this._z=0);break;case"YXZ":this._x=Math.asin(-Qt(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(a,f),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-d,r),this._z=0);break;case"ZXY":this._x=Math.asin(Qt(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(-d,f),this._z=Math.atan2(-o,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-Qt(d,-1,1)),Math.abs(d)<.9999999?(this._x=Math.atan2(u,f),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-o,c));break;case"YZX":this._z=Math.asin(Qt(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-d,r)):(this._x=0,this._y=Math.atan2(a,f));break;case"XZY":this._z=Math.asin(-Qt(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(u,c),this._y=Math.atan2(a,r)):(this._x=Math.atan2(-h,f),this._y=0);break;default:Ft("Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return Ll.makeRotationFromQuaternion(t),this.setFromRotationMatrix(Ll,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return Dl.setFromEuler(this),this.setFromQuaternion(Dl,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};Cn.DEFAULT_ORDER="XYZ";var Oi=class{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}},eu=0,Nl=new N,bi=new je,bn=new fe,Xs=new N,es=new N,nu=new N,iu=new je,Ul=new N(1,0,0),Fl=new N(0,1,0),Ol=new N(0,0,1),Bl={type:"added"},su={type:"removed"},Mi={type:"childadded",child:null},Jo={type:"childremoved",child:null},Pe=class i extends mn{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:eu++}),this.uuid=Ji(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=i.DEFAULT_UP.clone();let t=new N,e=new Cn,n=new je,s=new N(1,1,1);function r(){n.setFromEuler(e,!1)}function o(){e.setFromQuaternion(n,void 0,!1)}e._onChange(r),n._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new fe},normalMatrix:{value:new Ht}}),this.matrix=new fe,this.matrixWorld=new fe,this.matrixAutoUpdate=i.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=i.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Oi,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return bi.setFromAxisAngle(t,e),this.quaternion.multiply(bi),this}rotateOnWorldAxis(t,e){return bi.setFromAxisAngle(t,e),this.quaternion.premultiply(bi),this}rotateX(t){return this.rotateOnAxis(Ul,t)}rotateY(t){return this.rotateOnAxis(Fl,t)}rotateZ(t){return this.rotateOnAxis(Ol,t)}translateOnAxis(t,e){return Nl.copy(t).applyQuaternion(this.quaternion),this.position.add(Nl.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(Ul,t)}translateY(t){return this.translateOnAxis(Fl,t)}translateZ(t){return this.translateOnAxis(Ol,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(bn.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?Xs.copy(t):Xs.set(t,e,n);let s=this.parent;this.updateWorldMatrix(!0,!1),es.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?bn.lookAt(es,Xs,this.up):bn.lookAt(Xs,es,this.up),this.quaternion.setFromRotationMatrix(bn),s&&(bn.extractRotation(s.matrixWorld),bi.setFromRotationMatrix(bn),this.quaternion.premultiply(bi.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(zt("Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(Bl),Mi.child=t,this.dispatchEvent(Mi),Mi.child=null):zt("Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(su),Jo.child=t,this.dispatchEvent(Jo),Jo.child=null),this}removeFromParent(){let t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),bn.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),bn.multiply(t.parent.matrixWorld)),t.applyMatrix4(bn),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(Bl),Mi.child=t,this.dispatchEvent(Mi),Mi.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,s=this.children.length;n<s;n++){let o=this.children[n].getObjectByProperty(t,e);if(o!==void 0)return o}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);let s=this.children;for(let r=0,o=s.length;r<o;r++)s[r].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(es,t,nu),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(es,iu,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);let e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}traverse(t){t(this);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverseVisible(t)}traverseAncestors(t){let e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let t=this.pivot;if(t!==null){let e=t.x,n=t.y,s=t.z,r=this.matrix.elements;r[12]+=e-r[0]*e-r[4]*n-r[8]*s,r[13]+=n-r[1]*e-r[5]*n-r[9]*s,r[14]+=s-r[2]*e-r[6]*n-r[10]*s}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].updateMatrixWorld(t)}updateWorldMatrix(t,e,n=!1){let s=this.parent;if(t===!0&&s!==null&&s.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),e===!0){let r=this.children;for(let o=0,a=r.length;o<a;o++)r[o].updateWorldMatrix(!1,!0,n)}}toJSON(t){let e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let s={};s.uuid=this.uuid,s.type=this.type,this.name!==""&&(s.name=this.name),this.castShadow===!0&&(s.castShadow=!0),this.receiveShadow===!0&&(s.receiveShadow=!0),this.visible===!1&&(s.visible=!1),this.frustumCulled===!1&&(s.frustumCulled=!1),this.renderOrder!==0&&(s.renderOrder=this.renderOrder),this.static!==!1&&(s.static=this.static),Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.pivot!==null&&(s.pivot=this.pivot.toArray()),this.matrixAutoUpdate===!1&&(s.matrixAutoUpdate=!1),this.morphTargetDictionary!==void 0&&(s.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(s.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.geometryInfo=this._geometryInfo.map(a=>({...a,boundingBox:a.boundingBox?a.boundingBox.toJSON():void 0,boundingSphere:a.boundingSphere?a.boundingSphere.toJSON():void 0})),s.instanceInfo=this._instanceInfo.map(a=>({...a})),s.availableInstanceIds=this._availableInstanceIds.slice(),s.availableGeometryIds=this._availableGeometryIds.slice(),s.nextIndexStart=this._nextIndexStart,s.nextVertexStart=this._nextVertexStart,s.geometryCount=this._geometryCount,s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.matricesTexture=this._matricesTexture.toJSON(t),s.indirectTexture=this._indirectTexture.toJSON(t),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(s.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(s.boundingBox=this.boundingBox.toJSON()));function r(a,l){return a[l.uuid]===void 0&&(a[l.uuid]=l.toJSON(t)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(t.geometries,this.geometry);let a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){let l=a.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){let d=l[c];r(t.shapes,d)}else r(t.shapes,l)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(t.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let a=[];for(let l=0,c=this.material.length;l<c;l++)a.push(r(t.materials,this.material[l]));s.material=a}else s.material=r(t.materials,this.material);if(this.children.length>0){s.children=[];for(let a=0;a<this.children.length;a++)s.children.push(this.children[a].toJSON(t).object)}if(this.animations.length>0){s.animations=[];for(let a=0;a<this.animations.length;a++){let l=this.animations[a];s.animations.push(r(t.animations,l))}}if(e){let a=o(t.geometries),l=o(t.materials),c=o(t.textures),h=o(t.images),d=o(t.shapes),u=o(t.skeletons),f=o(t.animations),g=o(t.nodes);a.length>0&&(n.geometries=a),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),h.length>0&&(n.images=h),d.length>0&&(n.shapes=d),u.length>0&&(n.skeletons=u),f.length>0&&(n.animations=f),g.length>0&&(n.nodes=g)}return n.object=s,n;function o(a){let l=[];for(let c in a){let h=a[c];delete h.metadata,l.push(h)}return l}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.pivot=t.pivot!==null?t.pivot.clone():null,this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.static=t.static,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){let s=t.children[n];this.add(s.clone())}return this}};Pe.DEFAULT_UP=new N(0,1,0);Pe.DEFAULT_MATRIX_AUTO_UPDATE=!0;Pe.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var Ge=class extends Pe{constructor(){super(),this.isGroup=!0,this.type="Group"}},ru={type:"move"},Bi=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Ge,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Ge,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new N,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new N),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Ge,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new N,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new N,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){let e=this._hand;if(e)for(let n of t.hand.values())this._getHandJoint(e,n)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,e,n){let s=null,r=null,o=null,a=this._targetRay,l=this._grip,c=this._hand;if(t&&e.session.visibilityState!=="visible-blurred"){if(c&&t.hand){o=!0;for(let v of t.hand.values()){let m=e.getJointPose(v,n),p=this._getHandJoint(c,v);m!==null&&(p.matrix.fromArray(m.transform.matrix),p.matrix.decompose(p.position,p.rotation,p.scale),p.matrixWorldNeedsUpdate=!0,p.jointRadius=m.radius),p.visible=m!==null}let h=c.joints["index-finger-tip"],d=c.joints["thumb-tip"],u=h.position.distanceTo(d.position),f=.02,g=.005;c.inputState.pinching&&u>f+g?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!c.inputState.pinching&&u<=f-g&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else l!==null&&t.gripSpace&&(r=e.getPose(t.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1,l.eventsEnabled&&l.dispatchEvent({type:"gripUpdated",data:t,target:this})));a!==null&&(s=e.getPose(t.targetRaySpace,n),s===null&&r!==null&&(s=r),s!==null&&(a.matrix.fromArray(s.transform.matrix),a.matrix.decompose(a.position,a.rotation,a.scale),a.matrixWorldNeedsUpdate=!0,s.linearVelocity?(a.hasLinearVelocity=!0,a.linearVelocity.copy(s.linearVelocity)):a.hasLinearVelocity=!1,s.angularVelocity?(a.hasAngularVelocity=!0,a.angularVelocity.copy(s.angularVelocity)):a.hasAngularVelocity=!1,this.dispatchEvent(ru)))}return a!==null&&(a.visible=s!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=o!==null),this}_getHandJoint(t,e){if(t.joints[e.jointName]===void 0){let n=new Ge;n.matrixAutoUpdate=!1,n.visible=!1,t.joints[e.jointName]=n,t.add(n)}return t.joints[e.jointName]}},Lc={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},On={h:0,s:0,l:0},qs={h:0,s:0,l:0};function Ko(i,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?i+(t-i)*6*e:e<1/2?t:e<2/3?i+(t-i)*6*(2/3-e):i}var Gt=class{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){let s=t;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=He){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,jt.colorSpaceToWorking(this,e),this}setRGB(t,e,n,s=jt.workingColorSpace){return this.r=t,this.g=e,this.b=n,jt.colorSpaceToWorking(this,s),this}setHSL(t,e,n,s=jt.workingColorSpace){if(t=Ya(t,1),e=Qt(e,0,1),n=Qt(n,0,1),e===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+e):n+e-n*e,o=2*n-r;this.r=Ko(o,r,t+1/3),this.g=Ko(o,r,t),this.b=Ko(o,r,t-1/3)}return jt.colorSpaceToWorking(this,s),this}setStyle(t,e=He){function n(r){r!==void 0&&parseFloat(r)<1&&Ft("Color: Alpha component of "+t+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(t)){let r,o=s[1],a=s[2];switch(o){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,e);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,e);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,e);break;default:Ft("Color: Unknown color model "+t)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(t)){let r=s[1],o=r.length;if(o===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,e);if(o===6)return this.setHex(parseInt(r,16),e);Ft("Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=He){let n=Lc[t.toLowerCase()];return n!==void 0?this.setHex(n,e):Ft("Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=Tn(t.r),this.g=Tn(t.g),this.b=Tn(t.b),this}copyLinearToSRGB(t){return this.r=Li(t.r),this.g=Li(t.g),this.b=Li(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=He){return jt.workingToColorSpace(Re.copy(this),t),Math.round(Qt(Re.r*255,0,255))*65536+Math.round(Qt(Re.g*255,0,255))*256+Math.round(Qt(Re.b*255,0,255))}getHexString(t=He){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=jt.workingColorSpace){jt.workingToColorSpace(Re.copy(this),e);let n=Re.r,s=Re.g,r=Re.b,o=Math.max(n,s,r),a=Math.min(n,s,r),l,c,h=(a+o)/2;if(a===o)l=0,c=0;else{let d=o-a;switch(c=h<=.5?d/(o+a):d/(2-o-a),o){case n:l=(s-r)/d+(s<r?6:0);break;case s:l=(r-n)/d+2;break;case r:l=(n-s)/d+4;break}l/=6}return t.h=l,t.s=c,t.l=h,t}getRGB(t,e=jt.workingColorSpace){return jt.workingToColorSpace(Re.copy(this),e),t.r=Re.r,t.g=Re.g,t.b=Re.b,t}getStyle(t=He){jt.workingToColorSpace(Re.copy(this),t);let e=Re.r,n=Re.g,s=Re.b;return t!==He?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(s*255)})`}offsetHSL(t,e,n){return this.getHSL(On),this.setHSL(On.h+t,On.s+e,On.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(On),t.getHSL(qs);let n=os(On.h,qs.h,e),s=os(On.s,qs.s,e),r=os(On.l,qs.l,e);return this.setHSL(n,s,r),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){let e=this.r,n=this.g,s=this.b,r=t.elements;return this.r=r[0]*e+r[3]*n+r[6]*s,this.g=r[1]*e+r[4]*n+r[7]*s,this.b=r[2]*e+r[5]*n+r[8]*s,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Re=new Gt;Gt.NAMES=Lc;var ds=class i{constructor(t,e=1,n=1e3){this.isFog=!0,this.name="",this.color=new Gt(t),this.near=e,this.far=n}clone(){return new i(this.color,this.near,this.far)}toJSON(){return{type:"Fog",name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}},fs=class extends Pe{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Cn,this.environmentIntensity=1,this.environmentRotation=new Cn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,e){return super.copy(t,e),t.background!==null&&(this.background=t.background.clone()),t.environment!==null&&(this.environment=t.environment.clone()),t.fog!==null&&(this.fog=t.fog.clone()),this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),t.overrideMaterial!==null&&(this.overrideMaterial=t.overrideMaterial.clone()),this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){let e=super.toJSON(t);return this.fog!==null&&(e.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(e.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(e.object.backgroundIntensity=this.backgroundIntensity),e.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(e.object.environmentIntensity=this.environmentIntensity),e.object.environmentRotation=this.environmentRotation.toArray(),e}},en=new N,Mn=new N,jo=new N,Sn=new N,Si=new N,Ei=new N,zl=new N,Qo=new N,ta=new N,ea=new N,na=new pe,ia=new pe,sa=new pe,Hn=class i{constructor(t=new N,e=new N,n=new N){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,s){s.subVectors(n,e),en.subVectors(t,e),s.cross(en);let r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(t,e,n,s,r){en.subVectors(s,e),Mn.subVectors(n,e),jo.subVectors(t,e);let o=en.dot(en),a=en.dot(Mn),l=en.dot(jo),c=Mn.dot(Mn),h=Mn.dot(jo),d=o*c-a*a;if(d===0)return r.set(0,0,0),null;let u=1/d,f=(c*l-a*h)*u,g=(o*h-a*l)*u;return r.set(1-f-g,g,f)}static containsPoint(t,e,n,s){return this.getBarycoord(t,e,n,s,Sn)===null?!1:Sn.x>=0&&Sn.y>=0&&Sn.x+Sn.y<=1}static getInterpolation(t,e,n,s,r,o,a,l){return this.getBarycoord(t,e,n,s,Sn)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,Sn.x),l.addScaledVector(o,Sn.y),l.addScaledVector(a,Sn.z),l)}static getInterpolatedAttribute(t,e,n,s,r,o){return na.setScalar(0),ia.setScalar(0),sa.setScalar(0),na.fromBufferAttribute(t,e),ia.fromBufferAttribute(t,n),sa.fromBufferAttribute(t,s),o.setScalar(0),o.addScaledVector(na,r.x),o.addScaledVector(ia,r.y),o.addScaledVector(sa,r.z),o}static isFrontFacing(t,e,n,s){return en.subVectors(n,e),Mn.subVectors(t,e),en.cross(Mn).dot(s)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,s){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[s]),this}setFromAttributeAndIndices(t,e,n,s){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,s),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return en.subVectors(this.c,this.b),Mn.subVectors(this.a,this.b),en.cross(Mn).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return i.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return i.getBarycoord(t,this.a,this.b,this.c,e)}getInterpolation(t,e,n,s,r){return i.getInterpolation(t,this.a,this.b,this.c,e,n,s,r)}containsPoint(t){return i.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return i.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){let n=this.a,s=this.b,r=this.c,o,a;Si.subVectors(s,n),Ei.subVectors(r,n),Qo.subVectors(t,n);let l=Si.dot(Qo),c=Ei.dot(Qo);if(l<=0&&c<=0)return e.copy(n);ta.subVectors(t,s);let h=Si.dot(ta),d=Ei.dot(ta);if(h>=0&&d<=h)return e.copy(s);let u=l*d-h*c;if(u<=0&&l>=0&&h<=0)return o=l/(l-h),e.copy(n).addScaledVector(Si,o);ea.subVectors(t,r);let f=Si.dot(ea),g=Ei.dot(ea);if(g>=0&&f<=g)return e.copy(r);let v=f*c-l*g;if(v<=0&&c>=0&&g<=0)return a=c/(c-g),e.copy(n).addScaledVector(Ei,a);let m=h*g-f*d;if(m<=0&&d-h>=0&&f-g>=0)return zl.subVectors(r,s),a=(d-h)/(d-h+(f-g)),e.copy(s).addScaledVector(zl,a);let p=1/(m+v+u);return o=v*p,a=u*p,e.copy(n).addScaledVector(Si,o).addScaledVector(Ei,a)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}},Wn=class{constructor(t=new N(1/0,1/0,1/0),e=new N(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(nn.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(nn.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){let n=nn.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);let n=t.geometry;if(n!==void 0){let r=n.getAttribute("position");if(e===!0&&r!==void 0&&t.isInstancedMesh!==!0)for(let o=0,a=r.count;o<a;o++)t.isMesh===!0?t.getVertexPosition(o,nn):nn.fromBufferAttribute(r,o),nn.applyMatrix4(t.matrixWorld),this.expandByPoint(nn);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),Ys.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),Ys.copy(n.boundingBox)),Ys.applyMatrix4(t.matrixWorld),this.union(Ys)}let s=t.children;for(let r=0,o=s.length;r<o;r++)this.expandByObject(s[r],e);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,nn),nn.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(ns),$s.subVectors(this.max,ns),wi.subVectors(t.a,ns),Ti.subVectors(t.b,ns),Ai.subVectors(t.c,ns),Bn.subVectors(Ti,wi),zn.subVectors(Ai,Ti),ni.subVectors(wi,Ai);let e=[0,-Bn.z,Bn.y,0,-zn.z,zn.y,0,-ni.z,ni.y,Bn.z,0,-Bn.x,zn.z,0,-zn.x,ni.z,0,-ni.x,-Bn.y,Bn.x,0,-zn.y,zn.x,0,-ni.y,ni.x,0];return!ra(e,wi,Ti,Ai,$s)||(e=[1,0,0,0,1,0,0,0,1],!ra(e,wi,Ti,Ai,$s))?!1:(Zs.crossVectors(Bn,zn),e=[Zs.x,Zs.y,Zs.z],ra(e,wi,Ti,Ai,$s))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,nn).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(nn).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(En[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),En[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),En[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),En[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),En[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),En[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),En[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),En[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(En),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(t){return this.min.fromArray(t.min),this.max.fromArray(t.max),this}},En=[new N,new N,new N,new N,new N,new N,new N,new N],nn=new N,Ys=new Wn,wi=new N,Ti=new N,Ai=new N,Bn=new N,zn=new N,ni=new N,ns=new N,$s=new N,Zs=new N,ii=new N;function ra(i,t,e,n,s){for(let r=0,o=i.length-3;r<=o;r+=3){ii.fromArray(i,r);let a=s.x*Math.abs(ii.x)+s.y*Math.abs(ii.y)+s.z*Math.abs(ii.z),l=t.dot(ii),c=e.dot(ii),h=n.dot(ii);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>a)return!1}return!0}var ye=new N,Js=new Yt,ou=0,We=class extends mn{constructor(t,e,n=!1){if(super(),Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:ou++}),this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=va,this.updateRanges=[],this.gpuType=an,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[t+s]=e.array[n+s];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)Js.fromBufferAttribute(this,e),Js.applyMatrix3(t),this.setXY(e,Js.x,Js.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)ye.fromBufferAttribute(this,e),ye.applyMatrix3(t),this.setXYZ(e,ye.x,ye.y,ye.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)ye.fromBufferAttribute(this,e),ye.applyMatrix4(t),this.setXYZ(e,ye.x,ye.y,ye.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)ye.fromBufferAttribute(this,e),ye.applyNormalMatrix(t),this.setXYZ(e,ye.x,ye.y,ye.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)ye.fromBufferAttribute(this,e),ye.transformDirection(t),this.setXYZ(e,ye.x,ye.y,ye.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=Pi(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=De(n,this.array)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=Pi(e,this.array)),e}setX(t,e){return this.normalized&&(e=De(e,this.array)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=Pi(e,this.array)),e}setY(t,e){return this.normalized&&(e=De(e,this.array)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=Pi(e,this.array)),e}setZ(t,e){return this.normalized&&(e=De(e,this.array)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=Pi(e,this.array)),e}setW(t,e){return this.normalized&&(e=De(e,this.array)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=De(e,this.array),n=De(n,this.array)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,s){return t*=this.itemSize,this.normalized&&(e=De(e,this.array),n=De(n,this.array),s=De(s,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this}setXYZW(t,e,n,s,r){return t*=this.itemSize,this.normalized&&(e=De(e,this.array),n=De(n,this.array),s=De(s,this.array),r=De(r,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this.array[t+3]=r,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(t.name=this.name),this.usage!==va&&(t.usage=this.usage),t}dispose(){this.dispatchEvent({type:"dispose"})}};var ps=class extends We{constructor(t,e,n){super(new Uint16Array(t),e,n)}};var ms=class extends We{constructor(t,e,n){super(new Uint32Array(t),e,n)}};var ve=class extends We{constructor(t,e,n){super(new Float32Array(t),e,n)}},au=new Wn,is=new N,oa=new N,zi=class{constructor(t=new N,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){let n=this.center;e!==void 0?n.copy(e):au.setFromPoints(t).getCenter(n);let s=0;for(let r=0,o=t.length;r<o;r++)s=Math.max(s,n.distanceToSquared(t[r]));return this.radius=Math.sqrt(s),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){let e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){let n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;is.subVectors(t,this.center);let e=is.lengthSq();if(e>this.radius*this.radius){let n=Math.sqrt(e),s=(n-this.radius)*.5;this.center.addScaledVector(is,s/n),this.radius+=s}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(oa.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(is.copy(t.center).add(oa)),this.expandByPoint(is.copy(t.center).sub(oa))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(t){return this.radius=t.radius,this.center.fromArray(t.center),this}},lu=0,Je=new fe,aa=new Pe,Ci=new N,Ve=new Wn,ss=new Wn,Se=new N,qe=class i extends mn{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:lu++}),this.uuid=Ji(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(Lh(t)?ms:ps)(t,1):this.index=t,this}setIndirect(t,e=0){return this.indirect=t,this.indirectOffset=e,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){let e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new Ht().getNormalMatrix(t);n.applyNormalMatrix(r),n.needsUpdate=!0}let s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(t),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(t){return Je.makeRotationFromQuaternion(t),this.applyMatrix4(Je),this}rotateX(t){return Je.makeRotationX(t),this.applyMatrix4(Je),this}rotateY(t){return Je.makeRotationY(t),this.applyMatrix4(Je),this}rotateZ(t){return Je.makeRotationZ(t),this.applyMatrix4(Je),this}translate(t,e,n){return Je.makeTranslation(t,e,n),this.applyMatrix4(Je),this}scale(t,e,n){return Je.makeScale(t,e,n),this.applyMatrix4(Je),this}lookAt(t){return aa.lookAt(t),aa.updateMatrix(),this.applyMatrix4(aa.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Ci).negate(),this.translate(Ci.x,Ci.y,Ci.z),this}setFromPoints(t){let e=this.getAttribute("position");if(e===void 0){let n=[];for(let s=0,r=t.length;s<r;s++){let o=t[s];n.push(o.x,o.y,o.z||0)}this.setAttribute("position",new ve(n,3))}else{let n=Math.min(t.length,e.count);for(let s=0;s<n;s++){let r=t[s];e.setXYZ(s,r.x,r.y,r.z||0)}t.length>e.count&&Ft("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),e.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Wn);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){zt("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new N(-1/0,-1/0,-1/0),new N(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,s=e.length;n<s;n++){let r=e[n];Ve.setFromBufferAttribute(r),this.morphTargetsRelative?(Se.addVectors(this.boundingBox.min,Ve.min),this.boundingBox.expandByPoint(Se),Se.addVectors(this.boundingBox.max,Ve.max),this.boundingBox.expandByPoint(Se)):(this.boundingBox.expandByPoint(Ve.min),this.boundingBox.expandByPoint(Ve.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&zt('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new zi);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){zt("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new N,1/0);return}if(t){let n=this.boundingSphere.center;if(Ve.setFromBufferAttribute(t),e)for(let r=0,o=e.length;r<o;r++){let a=e[r];ss.setFromBufferAttribute(a),this.morphTargetsRelative?(Se.addVectors(Ve.min,ss.min),Ve.expandByPoint(Se),Se.addVectors(Ve.max,ss.max),Ve.expandByPoint(Se)):(Ve.expandByPoint(ss.min),Ve.expandByPoint(ss.max))}Ve.getCenter(n);let s=0;for(let r=0,o=t.count;r<o;r++)Se.fromBufferAttribute(t,r),s=Math.max(s,n.distanceToSquared(Se));if(e)for(let r=0,o=e.length;r<o;r++){let a=e[r],l=this.morphTargetsRelative;for(let c=0,h=a.count;c<h;c++)Se.fromBufferAttribute(a,c),l&&(Ci.fromBufferAttribute(t,c),Se.add(Ci)),s=Math.max(s,n.distanceToSquared(Se))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&zt('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){zt("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=e.position,s=e.normal,r=e.uv,o=this.getAttribute("tangent");(o===void 0||o.count!==n.count)&&(o=new We(new Float32Array(4*n.count),4),this.setAttribute("tangent",o));let a=[],l=[];for(let x=0;x<n.count;x++)a[x]=new N,l[x]=new N;let c=new N,h=new N,d=new N,u=new Yt,f=new Yt,g=new Yt,v=new N,m=new N;function p(x,w,R){c.fromBufferAttribute(n,x),h.fromBufferAttribute(n,w),d.fromBufferAttribute(n,R),u.fromBufferAttribute(r,x),f.fromBufferAttribute(r,w),g.fromBufferAttribute(r,R),h.sub(c),d.sub(c),f.sub(u),g.sub(u);let I=1/(f.x*g.y-g.x*f.y);isFinite(I)&&(v.copy(h).multiplyScalar(g.y).addScaledVector(d,-f.y).multiplyScalar(I),m.copy(d).multiplyScalar(f.x).addScaledVector(h,-g.x).multiplyScalar(I),a[x].add(v),a[w].add(v),a[R].add(v),l[x].add(m),l[w].add(m),l[R].add(m))}let E=this.groups;E.length===0&&(E=[{start:0,count:t.count}]);for(let x=0,w=E.length;x<w;++x){let R=E[x],I=R.start,D=R.count;for(let X=I,W=I+D;X<W;X+=3)p(t.getX(X+0),t.getX(X+1),t.getX(X+2))}let C=new N,S=new N,y=new N,M=new N;function T(x){y.fromBufferAttribute(s,x),M.copy(y);let w=a[x];C.copy(w),C.sub(y.multiplyScalar(y.dot(w))).normalize(),S.crossVectors(M,w);let I=S.dot(l[x])<0?-1:1;o.setXYZW(x,C.x,C.y,C.z,I)}for(let x=0,w=E.length;x<w;++x){let R=E[x],I=R.start,D=R.count;for(let X=I,W=I+D;X<W;X+=3)T(t.getX(X+0)),T(t.getX(X+1)),T(t.getX(X+2))}this._transformed=!0}computeVertexNormals(){let t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==e.count)n=new We(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let u=0,f=n.count;u<f;u++)n.setXYZ(u,0,0,0);let s=new N,r=new N,o=new N,a=new N,l=new N,c=new N,h=new N,d=new N;if(t)for(let u=0,f=t.count;u<f;u+=3){let g=t.getX(u+0),v=t.getX(u+1),m=t.getX(u+2);s.fromBufferAttribute(e,g),r.fromBufferAttribute(e,v),o.fromBufferAttribute(e,m),h.subVectors(o,r),d.subVectors(s,r),h.cross(d),a.fromBufferAttribute(n,g),l.fromBufferAttribute(n,v),c.fromBufferAttribute(n,m),a.add(h),l.add(h),c.add(h),n.setXYZ(g,a.x,a.y,a.z),n.setXYZ(v,l.x,l.y,l.z),n.setXYZ(m,c.x,c.y,c.z)}else for(let u=0,f=e.count;u<f;u+=3)s.fromBufferAttribute(e,u+0),r.fromBufferAttribute(e,u+1),o.fromBufferAttribute(e,u+2),h.subVectors(o,r),d.subVectors(s,r),h.cross(d),n.setXYZ(u+0,h.x,h.y,h.z),n.setXYZ(u+1,h.x,h.y,h.z),n.setXYZ(u+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)Se.fromBufferAttribute(t,e),Se.normalize(),t.setXYZ(e,Se.x,Se.y,Se.z)}toNonIndexed(){function t(a,l){let c=a.array,h=a.itemSize,d=a.normalized,u=new c.constructor(l.length*h),f=0,g=0;for(let v=0,m=l.length;v<m;v++){a.isInterleavedBufferAttribute?f=l[v]*a.data.stride+a.offset:f=l[v]*h;for(let p=0;p<h;p++)u[g++]=c[f++]}return new We(u,h,d)}if(this.index===null)return Ft("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let e=new i,n=this.index.array,s=this.attributes;for(let a in s){let l=s[a],c=t(l,n);e.setAttribute(a,c)}let r=this.morphAttributes;for(let a in r){let l=[],c=r[a];for(let h=0,d=c.length;h<d;h++){let u=c[h],f=t(u,n);l.push(f)}e.morphAttributes[a]=l}e.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let a=0,l=o.length;a<l;a++){let c=o[a];e.addGroup(c.start,c.count,c.materialIndex)}return e}toJSON(){let t={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,this.name!==""&&(t.name=this.name),Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){let l=this.parameters;for(let c in l)l[c]!==void 0&&(t[c]=l[c]);return t}t.data={attributes:{}};let e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});let n=this.attributes;for(let l in n){let c=n[l];t.data.attributes[l]=c.toJSON(t.data)}let s={},r=!1;for(let l in this.morphAttributes){let c=this.morphAttributes[l],h=[];for(let d=0,u=c.length;d<u;d++){let f=c[d];h.push(f.toJSON(t.data))}h.length>0&&(s[l]=h,r=!0)}r&&(t.data.morphAttributes=s,t.data.morphTargetsRelative=this.morphTargetsRelative);let o=this.groups;o.length>0&&(t.data.groups=JSON.parse(JSON.stringify(o)));let a=this.boundingSphere;return a!==null&&(t.data.boundingSphere=a.toJSON()),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let e={};this.name=t.name;let n=t.index;n!==null&&this.setIndex(n.clone());let s=t.attributes;for(let c in s){let h=s[c];this.setAttribute(c,h.clone(e))}let r=t.morphAttributes;for(let c in r){let h=[],d=r[c];for(let u=0,f=d.length;u<f;u++)h.push(d[u].clone(e));this.morphAttributes[c]=h}this.morphTargetsRelative=t.morphTargetsRelative;let o=t.groups;for(let c=0,h=o.length;c<h;c++){let d=o[c];this.addGroup(d.start,d.count,d.materialIndex)}let a=t.boundingBox;a!==null&&(this.boundingBox=a.clone());let l=t.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this._transformed=t._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}};var cu=0,Xn=class extends mn{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:cu++}),this.uuid=Ji(),this.name="",this.type="Material",this.blending=li,this.side=An,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=ur,this.blendDst=dr,this.blendEquation=Gn,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Gt(0,0,0),this.blendAlpha=0,this.depthFunc=ci,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=_a,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=oi,this.stencilZFail=oi,this.stencilZPass=oi,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(let e in t){let n=t[e];if(n===void 0){Ft(`Material: parameter '${e}' has value of undefined.`);continue}let s=this[e];if(s===void 0){Ft(`Material: '${e}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(n):s&&s.isVector2&&n&&n.isVector2||s&&s.isEuler&&n&&n.isEuler||s&&s.isVector3&&n&&n.isVector3?s.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});let n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(t).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(t).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==li&&(n.blending=this.blending),this.side!==An&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==ur&&(n.blendSrc=this.blendSrc),this.blendDst!==dr&&(n.blendDst=this.blendDst),this.blendEquation!==Gn&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==ci&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==_a&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==oi&&(n.stencilFail=this.stencilFail),this.stencilZFail!==oi&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==oi&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.allowOverride===!1&&(n.allowOverride=!1),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function s(r){let o=[];for(let a in r){let l=r[a];delete l.metadata,o.push(l)}return o}if(e){let r=s(t.textures),o=s(t.images);r.length>0&&(n.textures=r),o.length>0&&(n.images=o)}return n}fromJSON(t,e){if(t.uuid!==void 0&&(this.uuid=t.uuid),t.name!==void 0&&(this.name=t.name),t.color!==void 0&&this.color!==void 0&&this.color.setHex(t.color),t.roughness!==void 0&&(this.roughness=t.roughness),t.metalness!==void 0&&(this.metalness=t.metalness),t.sheen!==void 0&&(this.sheen=t.sheen),t.sheenColor!==void 0&&(this.sheenColor=new Gt().setHex(t.sheenColor)),t.sheenRoughness!==void 0&&(this.sheenRoughness=t.sheenRoughness),t.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(t.emissive),t.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(t.specular),t.specularIntensity!==void 0&&(this.specularIntensity=t.specularIntensity),t.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(t.specularColor),t.shininess!==void 0&&(this.shininess=t.shininess),t.clearcoat!==void 0&&(this.clearcoat=t.clearcoat),t.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=t.clearcoatRoughness),t.dispersion!==void 0&&(this.dispersion=t.dispersion),t.iridescence!==void 0&&(this.iridescence=t.iridescence),t.iridescenceIOR!==void 0&&(this.iridescenceIOR=t.iridescenceIOR),t.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=t.iridescenceThicknessRange),t.transmission!==void 0&&(this.transmission=t.transmission),t.thickness!==void 0&&(this.thickness=t.thickness),t.attenuationDistance!==void 0&&(this.attenuationDistance=t.attenuationDistance),t.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(t.attenuationColor),t.anisotropy!==void 0&&(this.anisotropy=t.anisotropy),t.anisotropyRotation!==void 0&&(this.anisotropyRotation=t.anisotropyRotation),t.fog!==void 0&&(this.fog=t.fog),t.flatShading!==void 0&&(this.flatShading=t.flatShading),t.blending!==void 0&&(this.blending=t.blending),t.combine!==void 0&&(this.combine=t.combine),t.side!==void 0&&(this.side=t.side),t.shadowSide!==void 0&&(this.shadowSide=t.shadowSide),t.opacity!==void 0&&(this.opacity=t.opacity),t.transparent!==void 0&&(this.transparent=t.transparent),t.alphaTest!==void 0&&(this.alphaTest=t.alphaTest),t.alphaHash!==void 0&&(this.alphaHash=t.alphaHash),t.depthFunc!==void 0&&(this.depthFunc=t.depthFunc),t.depthTest!==void 0&&(this.depthTest=t.depthTest),t.depthWrite!==void 0&&(this.depthWrite=t.depthWrite),t.colorWrite!==void 0&&(this.colorWrite=t.colorWrite),t.blendSrc!==void 0&&(this.blendSrc=t.blendSrc),t.blendDst!==void 0&&(this.blendDst=t.blendDst),t.blendEquation!==void 0&&(this.blendEquation=t.blendEquation),t.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=t.blendSrcAlpha),t.blendDstAlpha!==void 0&&(this.blendDstAlpha=t.blendDstAlpha),t.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=t.blendEquationAlpha),t.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(t.blendColor),t.blendAlpha!==void 0&&(this.blendAlpha=t.blendAlpha),t.stencilWriteMask!==void 0&&(this.stencilWriteMask=t.stencilWriteMask),t.stencilFunc!==void 0&&(this.stencilFunc=t.stencilFunc),t.stencilRef!==void 0&&(this.stencilRef=t.stencilRef),t.stencilFuncMask!==void 0&&(this.stencilFuncMask=t.stencilFuncMask),t.stencilFail!==void 0&&(this.stencilFail=t.stencilFail),t.stencilZFail!==void 0&&(this.stencilZFail=t.stencilZFail),t.stencilZPass!==void 0&&(this.stencilZPass=t.stencilZPass),t.stencilWrite!==void 0&&(this.stencilWrite=t.stencilWrite),t.wireframe!==void 0&&(this.wireframe=t.wireframe),t.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=t.wireframeLinewidth),t.wireframeLinecap!==void 0&&(this.wireframeLinecap=t.wireframeLinecap),t.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=t.wireframeLinejoin),t.rotation!==void 0&&(this.rotation=t.rotation),t.linewidth!==void 0&&(this.linewidth=t.linewidth),t.dashSize!==void 0&&(this.dashSize=t.dashSize),t.gapSize!==void 0&&(this.gapSize=t.gapSize),t.scale!==void 0&&(this.scale=t.scale),t.polygonOffset!==void 0&&(this.polygonOffset=t.polygonOffset),t.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=t.polygonOffsetFactor),t.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=t.polygonOffsetUnits),t.dithering!==void 0&&(this.dithering=t.dithering),t.alphaToCoverage!==void 0&&(this.alphaToCoverage=t.alphaToCoverage),t.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=t.premultipliedAlpha),t.forceSinglePass!==void 0&&(this.forceSinglePass=t.forceSinglePass),t.allowOverride!==void 0&&(this.allowOverride=t.allowOverride),t.visible!==void 0&&(this.visible=t.visible),t.toneMapped!==void 0&&(this.toneMapped=t.toneMapped),t.userData!==void 0&&(this.userData=t.userData),t.vertexColors!==void 0&&(typeof t.vertexColors=="number"?this.vertexColors=t.vertexColors>0:this.vertexColors=t.vertexColors),t.size!==void 0&&(this.size=t.size),t.sizeAttenuation!==void 0&&(this.sizeAttenuation=t.sizeAttenuation),t.map!==void 0&&(this.map=e[t.map]||null),t.matcap!==void 0&&(this.matcap=e[t.matcap]||null),t.alphaMap!==void 0&&(this.alphaMap=e[t.alphaMap]||null),t.bumpMap!==void 0&&(this.bumpMap=e[t.bumpMap]||null),t.bumpScale!==void 0&&(this.bumpScale=t.bumpScale),t.normalMap!==void 0&&(this.normalMap=e[t.normalMap]||null),t.normalMapType!==void 0&&(this.normalMapType=t.normalMapType),t.normalScale!==void 0){let n=t.normalScale;Array.isArray(n)===!1&&(n=[n,n]),this.normalScale=new Yt().fromArray(n)}return t.displacementMap!==void 0&&(this.displacementMap=e[t.displacementMap]||null),t.displacementScale!==void 0&&(this.displacementScale=t.displacementScale),t.displacementBias!==void 0&&(this.displacementBias=t.displacementBias),t.roughnessMap!==void 0&&(this.roughnessMap=e[t.roughnessMap]||null),t.metalnessMap!==void 0&&(this.metalnessMap=e[t.metalnessMap]||null),t.emissiveMap!==void 0&&(this.emissiveMap=e[t.emissiveMap]||null),t.emissiveIntensity!==void 0&&(this.emissiveIntensity=t.emissiveIntensity),t.specularMap!==void 0&&(this.specularMap=e[t.specularMap]||null),t.specularIntensityMap!==void 0&&(this.specularIntensityMap=e[t.specularIntensityMap]||null),t.specularColorMap!==void 0&&(this.specularColorMap=e[t.specularColorMap]||null),t.envMap!==void 0&&(this.envMap=e[t.envMap]||null),t.envMapRotation!==void 0&&this.envMapRotation.fromArray(t.envMapRotation),t.envMapIntensity!==void 0&&(this.envMapIntensity=t.envMapIntensity),t.reflectivity!==void 0&&(this.reflectivity=t.reflectivity),t.refractionRatio!==void 0&&(this.refractionRatio=t.refractionRatio),t.lightMap!==void 0&&(this.lightMap=e[t.lightMap]||null),t.lightMapIntensity!==void 0&&(this.lightMapIntensity=t.lightMapIntensity),t.aoMap!==void 0&&(this.aoMap=e[t.aoMap]||null),t.aoMapIntensity!==void 0&&(this.aoMapIntensity=t.aoMapIntensity),t.gradientMap!==void 0&&(this.gradientMap=e[t.gradientMap]||null),t.clearcoatMap!==void 0&&(this.clearcoatMap=e[t.clearcoatMap]||null),t.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=e[t.clearcoatRoughnessMap]||null),t.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=e[t.clearcoatNormalMap]||null),t.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new Yt().fromArray(t.clearcoatNormalScale)),t.iridescenceMap!==void 0&&(this.iridescenceMap=e[t.iridescenceMap]||null),t.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=e[t.iridescenceThicknessMap]||null),t.transmissionMap!==void 0&&(this.transmissionMap=e[t.transmissionMap]||null),t.thicknessMap!==void 0&&(this.thicknessMap=e[t.thicknessMap]||null),t.anisotropyMap!==void 0&&(this.anisotropyMap=e[t.anisotropyMap]||null),t.sheenColorMap!==void 0&&(this.sheenColorMap=e[t.sheenColorMap]||null),t.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=e[t.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;let e=t.clippingPlanes,n=null;if(e!==null){let s=e.length;n=new Array(s);for(let r=0;r!==s;++r)n[r]=e[r].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.allowOverride=t.allowOverride,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}};var wn=new N,la=new N,Ks=new N,kn=new N,ca=new N,js=new N,ha=new N,gs=class{constructor(t=new N,e=new N(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,wn)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);let n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){let e=wn.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(wn.copy(this.origin).addScaledVector(this.direction,e),wn.distanceToSquared(t))}distanceSqToSegment(t,e,n,s){la.copy(t).add(e).multiplyScalar(.5),Ks.copy(e).sub(t).normalize(),kn.copy(this.origin).sub(la);let r=t.distanceTo(e)*.5,o=-this.direction.dot(Ks),a=kn.dot(this.direction),l=-kn.dot(Ks),c=kn.lengthSq(),h=Math.abs(1-o*o),d,u,f,g;if(h>0)if(d=o*l-a,u=o*a-l,g=r*h,d>=0)if(u>=-g)if(u<=g){let v=1/h;d*=v,u*=v,f=d*(d+o*u+2*a)+u*(o*d+u+2*l)+c}else u=r,d=Math.max(0,-(o*u+a)),f=-d*d+u*(u+2*l)+c;else u=-r,d=Math.max(0,-(o*u+a)),f=-d*d+u*(u+2*l)+c;else u<=-g?(d=Math.max(0,-(-o*r+a)),u=d>0?-r:Math.min(Math.max(-r,-l),r),f=-d*d+u*(u+2*l)+c):u<=g?(d=0,u=Math.min(Math.max(-r,-l),r),f=u*(u+2*l)+c):(d=Math.max(0,-(o*r+a)),u=d>0?r:Math.min(Math.max(-r,-l),r),f=-d*d+u*(u+2*l)+c);else u=o>0?-r:r,d=Math.max(0,-(o*u+a)),f=-d*d+u*(u+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,d),s&&s.copy(la).addScaledVector(Ks,u),f}intersectSphere(t,e){wn.subVectors(t.center,this.origin);let n=wn.dot(this.direction),s=wn.dot(wn)-n*n,r=t.radius*t.radius;if(s>r)return null;let o=Math.sqrt(r-s),a=n-o,l=n+o;return l<0?null:a<0?this.at(l,e):this.at(a,e)}intersectsSphere(t){return t.radius<0?!1:this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){let e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){let n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){let e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,s,r,o,a,l,c=1/this.direction.x,h=1/this.direction.y,d=1/this.direction.z,u=this.origin;return c>=0?(n=(t.min.x-u.x)*c,s=(t.max.x-u.x)*c):(n=(t.max.x-u.x)*c,s=(t.min.x-u.x)*c),h>=0?(r=(t.min.y-u.y)*h,o=(t.max.y-u.y)*h):(r=(t.max.y-u.y)*h,o=(t.min.y-u.y)*h),n>o||r>s||((r>n||isNaN(n))&&(n=r),(o<s||isNaN(s))&&(s=o),d>=0?(a=(t.min.z-u.z)*d,l=(t.max.z-u.z)*d):(a=(t.max.z-u.z)*d,l=(t.min.z-u.z)*d),n>l||a>s)||((a>n||n!==n)&&(n=a),(l<s||s!==s)&&(s=l),s<0)?null:this.at(n>=0?n:s,e)}intersectsBox(t){return this.intersectBox(t,wn)!==null}intersectTriangle(t,e,n,s,r){ca.subVectors(e,t),js.subVectors(n,t),ha.crossVectors(ca,js);let o=this.direction.dot(ha),a;if(o>0){if(s)return null;a=1}else if(o<0)a=-1,o=-o;else return null;kn.subVectors(this.origin,t);let l=a*this.direction.dot(js.crossVectors(kn,js));if(l<0)return null;let c=a*this.direction.dot(ca.cross(kn));if(c<0||l+c>o)return null;let h=-a*kn.dot(ha);return h<0?null:this.at(h/o,r)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},Ne=class extends Xn{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Gt(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Cn,this.combine=Ra,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}},kl=new fe,si=new gs,Qs=new zi,Vl=new N,tr=new N,er=new N,nr=new N,ua=new N,ir=new N,Hl=new N,sr=new N,ue=class extends Pe{constructor(t=new qe,e=new Ne){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let s=e[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=s.length;r<o;r++){let a=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}getVertexPosition(t,e){let n=this.geometry,s=n.attributes.position,r=n.morphAttributes.position,o=n.morphTargetsRelative;e.fromBufferAttribute(s,t);let a=this.morphTargetInfluences;if(r&&a){ir.set(0,0,0);for(let l=0,c=r.length;l<c;l++){let h=a[l],d=r[l];h!==0&&(ua.fromBufferAttribute(d,t),o?ir.addScaledVector(ua,h):ir.addScaledVector(ua.sub(e),h))}e.add(ir)}return e}raycast(t,e){let n=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),Qs.copy(n.boundingSphere),Qs.applyMatrix4(r),si.copy(t.ray).recast(t.near),!(Qs.containsPoint(si.origin)===!1&&(si.intersectSphere(Qs,Vl)===null||si.origin.distanceToSquared(Vl)>(t.far-t.near)**2))&&(kl.copy(r).invert(),si.copy(t.ray).applyMatrix4(kl),!(n.boundingBox!==null&&si.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,si)))}_computeIntersections(t,e,n){let s,r=this.geometry,o=this.material,a=r.index,l=r.attributes.position,c=r.attributes.uv,h=r.attributes.uv1,d=r.attributes.normal,u=r.groups,f=r.drawRange;if(a!==null)if(Array.isArray(o))for(let g=0,v=u.length;g<v;g++){let m=u[g],p=o[m.materialIndex],E=Math.max(m.start,f.start),C=Math.min(a.count,Math.min(m.start+m.count,f.start+f.count));for(let S=E,y=C;S<y;S+=3){let M=a.getX(S),T=a.getX(S+1),x=a.getX(S+2);s=rr(this,p,t,n,c,h,d,M,T,x),s&&(s.faceIndex=Math.floor(S/3),s.face.materialIndex=m.materialIndex,e.push(s))}}else{let g=Math.max(0,f.start),v=Math.min(a.count,f.start+f.count);for(let m=g,p=v;m<p;m+=3){let E=a.getX(m),C=a.getX(m+1),S=a.getX(m+2);s=rr(this,o,t,n,c,h,d,E,C,S),s&&(s.faceIndex=Math.floor(m/3),e.push(s))}}else if(l!==void 0)if(Array.isArray(o))for(let g=0,v=u.length;g<v;g++){let m=u[g],p=o[m.materialIndex],E=Math.max(m.start,f.start),C=Math.min(l.count,Math.min(m.start+m.count,f.start+f.count));for(let S=E,y=C;S<y;S+=3){let M=S,T=S+1,x=S+2;s=rr(this,p,t,n,c,h,d,M,T,x),s&&(s.faceIndex=Math.floor(S/3),s.face.materialIndex=m.materialIndex,e.push(s))}}else{let g=Math.max(0,f.start),v=Math.min(l.count,f.start+f.count);for(let m=g,p=v;m<p;m+=3){let E=m,C=m+1,S=m+2;s=rr(this,o,t,n,c,h,d,E,C,S),s&&(s.faceIndex=Math.floor(m/3),e.push(s))}}}};function hu(i,t,e,n,s,r,o,a){let l;if(t.side===Te?l=n.intersectTriangle(o,r,s,!0,a):l=n.intersectTriangle(s,r,o,t.side===An,a),l===null)return null;sr.copy(a),sr.applyMatrix4(i.matrixWorld);let c=e.ray.origin.distanceTo(sr);return c<e.near||c>e.far?null:{distance:c,point:sr.clone(),object:i}}function rr(i,t,e,n,s,r,o,a,l,c){i.getVertexPosition(a,tr),i.getVertexPosition(l,er),i.getVertexPosition(c,nr);let h=hu(i,t,e,n,tr,er,nr,Hl);if(h){let d=new N;Hn.getBarycoord(Hl,tr,er,nr,d),s&&(h.uv=Hn.getInterpolatedAttribute(s,a,l,c,d,new Yt)),r&&(h.uv1=Hn.getInterpolatedAttribute(r,a,l,c,d,new Yt)),o&&(h.normal=Hn.getInterpolatedAttribute(o,a,l,c,d,new N),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));let u={a,b:l,c,normal:new N,materialIndex:0};Hn.getNormal(tr,er,nr,u.normal),h.face=u,h.barycoord=d}return h}var Tr=class extends Fe{constructor(t=null,e=1,n=1,s,r,o,a,l,c=Ee,h=Ee,d,u){super(null,o,a,l,c,h,s,r,d,u),this.isDataTexture=!0,this.image={data:t,width:e,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var da=new N,uu=new N,du=new Ht,Ke=class{constructor(t=new N(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,s){return this.normal.set(t,e,n),this.constant=s,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){let s=da.subVectors(n,e).cross(uu.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(s,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){let t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e,n=!0){let s=t.delta(da),r=this.normal.dot(s);if(r===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;let o=-(t.start.dot(this.normal)+this.constant)/r;return n===!0&&(o<0||o>1)?null:e.copy(t.start).addScaledVector(s,o)}intersectsLine(t){let e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){let n=e||du.getNormalMatrix(t),s=this.coplanarPoint(da).applyMatrix4(t),r=this.normal.applyMatrix3(n).normalize();return this.constant=-s.dot(r),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}},ri=new zi,fu=new Yt(.5,.5),or=new N,ki=class{constructor(t=new Ke,e=new Ke,n=new Ke,s=new Ke,r=new Ke,o=new Ke){this.planes=[t,e,n,s,r,o]}set(t,e,n,s,r,o){let a=this.planes;return a[0].copy(t),a[1].copy(e),a[2].copy(n),a[3].copy(s),a[4].copy(r),a[5].copy(o),this}copy(t){let e=this.planes;for(let n=0;n<6;n++)e[n].copy(t.planes[n]);return this}setFromProjectionMatrix(t,e=sn,n=!1){let s=this.planes,r=t.elements,o=r[0],a=r[1],l=r[2],c=r[3],h=r[4],d=r[5],u=r[6],f=r[7],g=r[8],v=r[9],m=r[10],p=r[11],E=r[12],C=r[13],S=r[14],y=r[15];if(s[0].setComponents(c-o,f-h,p-g,y-E).normalize(),s[1].setComponents(c+o,f+h,p+g,y+E).normalize(),s[2].setComponents(c+a,f+d,p+v,y+C).normalize(),s[3].setComponents(c-a,f-d,p-v,y-C).normalize(),n)s[4].setComponents(l,u,m,S).normalize(),s[5].setComponents(c-l,f-u,p-m,y-S).normalize();else if(s[4].setComponents(c-l,f-u,p-m,y-S).normalize(),e===sn)s[5].setComponents(c+l,f+u,p+m,y+S).normalize();else if(e===Di)s[5].setComponents(l,u,m,S).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+e);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),ri.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{let e=t.geometry;e.boundingSphere===null&&e.computeBoundingSphere(),ri.copy(e.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(ri)}intersectsSprite(t){ri.center.set(0,0,0);let e=fu.distanceTo(t.center);return ri.radius=.7071067811865476+e,ri.applyMatrix4(t.matrixWorld),this.intersectsSphere(ri)}intersectsSphere(t){let e=this.planes,n=t.center,s=-t.radius;for(let r=0;r<6;r++)if(e[r].distanceToPoint(n)<s)return!1;return!0}intersectsBox(t){let e=this.planes;for(let n=0;n<6;n++){let s=e[n];if(or.x=s.normal.x>0?t.max.x:t.min.x,or.y=s.normal.y>0?t.max.y:t.min.y,or.z=s.normal.z>0?t.max.z:t.min.z,s.distanceToPoint(or)<0)return!1}return!0}containsPoint(t){let e=this.planes;for(let n=0;n<6;n++)if(e[n].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};var xs=class extends Fe{constructor(t=[],e=Zn,n,s,r,o,a,l,c,h){super(t,e,n,s,r,o,a,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}};var Rn=class extends Fe{constructor(t,e,n=on,s,r,o,a=Ee,l=Ee,c,h=pn,d=1){if(h!==pn&&h!==Kn)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");let u={width:t,height:e,depth:d};super(u,s,r,o,a,l,h,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.source=new Fi(Object.assign({},t.image)),this.compareFunction=t.compareFunction,this}toJSON(t){let e=super.toJSON(t);return this.compareFunction!==null&&(e.compareFunction=this.compareFunction),e}},Ar=class extends Rn{constructor(t,e=on,n=Zn,s,r,o=Ee,a=Ee,l,c=pn){let h={width:t,height:t,depth:1},d=[h,h,h,h,h,h];super(t,t,e,n,s,r,o,a,l,c),this.image=d,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(t){this.image=t}},_s=class extends Fe{constructor(t=null){super(),this.sourceTexture=t,this.isExternalTexture=!0}copy(t){return super.copy(t),this.sourceTexture=t.sourceTexture,this}},Vi=class i extends qe{constructor(t=1,e=1,n=1,s=1,r=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:e,depth:n,widthSegments:s,heightSegments:r,depthSegments:o};let a=this;s=Math.floor(s),r=Math.floor(r),o=Math.floor(o);let l=[],c=[],h=[],d=[],u=0,f=0;g("z","y","x",-1,-1,n,e,t,o,r,0),g("z","y","x",1,-1,n,e,-t,o,r,1),g("x","z","y",1,1,t,n,e,s,o,2),g("x","z","y",1,-1,t,n,-e,s,o,3),g("x","y","z",1,-1,t,e,n,s,r,4),g("x","y","z",-1,-1,t,e,-n,s,r,5),this.setIndex(l),this.setAttribute("position",new ve(c,3)),this.setAttribute("normal",new ve(h,3)),this.setAttribute("uv",new ve(d,2));function g(v,m,p,E,C,S,y,M,T,x,w){let R=S/T,I=y/x,D=S/2,X=y/2,W=M/2,L=T+1,k=x+1,z=0,Z=0,tt=new N;for(let rt=0;rt<k;rt++){let st=rt*I-X;for(let xt=0;xt<L;xt++){let Kt=xt*R-D;tt[v]=Kt*E,tt[m]=st*C,tt[p]=W,c.push(tt.x,tt.y,tt.z),tt[v]=0,tt[m]=0,tt[p]=M>0?1:-1,h.push(tt.x,tt.y,tt.z),d.push(xt/T),d.push(1-rt/x),z+=1}}for(let rt=0;rt<x;rt++)for(let st=0;st<T;st++){let xt=u+st+L*rt,Kt=u+st+L*(rt+1),de=u+(st+1)+L*(rt+1),te=u+(st+1)+L*rt;l.push(xt,Kt,te),l.push(Kt,de,te),Z+=6}a.addGroup(f,Z,w),f+=Z,u+=z}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}};var Hi=class i extends qe{constructor(t=1,e=1,n=1,s=32,r=1,o=!1,a=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:t,radiusBottom:e,height:n,radialSegments:s,heightSegments:r,openEnded:o,thetaStart:a,thetaLength:l};let c=this;s=Math.floor(s),r=Math.floor(r);let h=[],d=[],u=[],f=[],g=0,v=[],m=n/2,p=0;E(),o===!1&&(t>0&&C(!0),e>0&&C(!1)),this.setIndex(h),this.setAttribute("position",new ve(d,3)),this.setAttribute("normal",new ve(u,3)),this.setAttribute("uv",new ve(f,2));function E(){let S=new N,y=new N,M=0,T=(e-t)/n;for(let x=0;x<=r;x++){let w=[],R=x/r,I=R*(e-t)+t;for(let D=0;D<=s;D++){let X=D/s,W=X*l+a,L=Math.sin(W),k=Math.cos(W);y.x=I*L,y.y=-R*n+m,y.z=I*k,d.push(y.x,y.y,y.z),S.set(L,T,k).normalize(),u.push(S.x,S.y,S.z),f.push(X,1-R),w.push(g++)}v.push(w)}for(let x=0;x<s;x++)for(let w=0;w<r;w++){let R=v[w][x],I=v[w+1][x],D=v[w+1][x+1],X=v[w][x+1];(t>0||w!==0)&&(h.push(R,I,X),M+=3),(e>0||w!==r-1)&&(h.push(I,D,X),M+=3)}c.addGroup(p,M,0),p+=M}function C(S){let y=g,M=new Yt,T=new N,x=0,w=S===!0?t:e,R=S===!0?1:-1;for(let D=1;D<=s;D++)d.push(0,m*R,0),u.push(0,R,0),f.push(.5,.5),g++;let I=g;for(let D=0;D<=s;D++){let W=D/s*l+a,L=Math.cos(W),k=Math.sin(W);T.x=w*k,T.y=m*R,T.z=w*L,d.push(T.x,T.y,T.z),u.push(0,R,0),M.x=L*.5+.5,M.y=k*.5*R+.5,f.push(M.x,M.y),g++}for(let D=0;D<s;D++){let X=y+D,W=I+D;S===!0?h.push(W,W+1,X):h.push(W+1,W,X),x+=3}c.addGroup(p,x,S===!0?1:2),p+=x}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},vs=class i extends Hi{constructor(t=1,e=1,n=32,s=1,r=!1,o=0,a=Math.PI*2){super(0,t,e,n,s,r,o,a),this.type="ConeGeometry",this.parameters={radius:t,height:e,radialSegments:n,heightSegments:s,openEnded:r,thetaStart:o,thetaLength:a}}static fromJSON(t){return new i(t.radius,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}};var ys=class i extends qe{constructor(t=1,e=1,n=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:e,widthSegments:n,heightSegments:s};let r=t/2,o=e/2,a=Math.floor(n),l=Math.floor(s),c=a+1,h=l+1,d=t/a,u=e/l,f=[],g=[],v=[],m=[];for(let p=0;p<h;p++){let E=p*u-o;for(let C=0;C<c;C++){let S=C*d-r;g.push(S,-E,0),v.push(0,0,1),m.push(C/a),m.push(1-p/l)}}for(let p=0;p<l;p++)for(let E=0;E<a;E++){let C=E+c*p,S=E+c*(p+1),y=E+1+c*(p+1),M=E+1+c*p;f.push(C,S,M),f.push(S,y,M)}this.setIndex(f),this.setAttribute("position",new ve(g,3)),this.setAttribute("normal",new ve(v,3)),this.setAttribute("uv",new ve(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.width,t.height,t.widthSegments,t.heightSegments)}},Gi=class i extends qe{constructor(t=.5,e=1,n=32,s=1,r=0,o=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:t,outerRadius:e,thetaSegments:n,phiSegments:s,thetaStart:r,thetaLength:o},n=Math.max(3,n),s=Math.max(1,s);let a=[],l=[],c=[],h=[],d=t,u=(e-t)/s,f=new N,g=new Yt;for(let v=0;v<=s;v++){for(let m=0;m<=n;m++){let p=r+m/n*o;f.x=d*Math.cos(p),f.y=d*Math.sin(p),l.push(f.x,f.y,f.z),c.push(0,0,1),g.x=(f.x/e+1)/2,g.y=(f.y/e+1)/2,h.push(g.x,g.y)}d+=u}for(let v=0;v<s;v++){let m=v*(n+1);for(let p=0;p<n;p++){let E=p+m,C=E,S=E+n+1,y=E+n+2,M=E+1;a.push(C,S,M),a.push(S,y,M)}}this.setIndex(a),this.setAttribute("position",new ve(l,3)),this.setAttribute("normal",new ve(c,3)),this.setAttribute("uv",new ve(h,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.innerRadius,t.outerRadius,t.thetaSegments,t.phiSegments,t.thetaStart,t.thetaLength)}};var hi=class i extends qe{constructor(t=1,e=32,n=16,s=0,r=Math.PI*2,o=0,a=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:t,widthSegments:e,heightSegments:n,phiStart:s,phiLength:r,thetaStart:o,thetaLength:a},e=Math.max(3,Math.floor(e)),n=Math.max(2,Math.floor(n));let l=Math.min(o+a,Math.PI),c=0,h=[],d=new N,u=new N,f=[],g=[],v=[],m=[];for(let p=0;p<=n;p++){let E=[],C=p/n,S=o+C*a,y=t*Math.cos(S),M=Math.sqrt(t*t-y*y),T=0;p===0&&o===0?T=.5/e:p===n&&l===Math.PI&&(T=-.5/e);for(let x=0;x<=e;x++){let w=x/e,R=s+w*r;d.x=-M*Math.cos(R),d.y=y,d.z=M*Math.sin(R),g.push(d.x,d.y,d.z),u.copy(d).normalize(),v.push(u.x,u.y,u.z),m.push(w+T,1-C),E.push(c++)}h.push(E)}for(let p=0;p<n;p++)for(let E=0;E<e;E++){let C=h[p][E+1],S=h[p][E],y=h[p+1][E],M=h[p+1][E+1];(p!==0||o>0)&&f.push(C,S,M),(p!==n-1||l<Math.PI)&&f.push(S,y,M)}this.setIndex(f),this.setAttribute("position",new ve(g,3)),this.setAttribute("normal",new ve(v,3)),this.setAttribute("uv",new ve(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}};function di(i){let t={};for(let e in i){t[e]={};for(let n in i[e]){let s=i[e][n];if(Gl(s))s.isRenderTargetTexture?(Ft("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=s.clone();else if(Array.isArray(s))if(Gl(s[0])){let r=[];for(let o=0,a=s.length;o<a;o++)r[o]=s[o].clone();t[e][n]=r}else t[e][n]=s.slice();else t[e][n]=s}}return t}function Le(i){let t={};for(let e=0;e<i.length;e++){let n=di(i[e]);for(let s in n)t[s]=n[s]}return t}function Gl(i){return i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)}function pu(i){let t=[];for(let e=0;e<i.length;e++)t.push(i[e].clone());return t}function $a(i){let t=i.getRenderTarget();return t===null?i.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:jt.workingColorSpace}var Dc={clone:di,merge:Le},mu=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,gu=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,Ye=class extends Xn{constructor(t){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=mu,this.fragmentShader=gu,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=di(t.uniforms),this.uniformsGroups=pu(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this.defaultAttributeValues=Object.assign({},t.defaultAttributeValues),this.index0AttributeName=t.index0AttributeName,this.uniformsNeedUpdate=t.uniformsNeedUpdate,this}toJSON(t){let e=super.toJSON(t);e.glslVersion=this.glslVersion,e.uniforms={};for(let s in this.uniforms){let o=this.uniforms[s].value;o&&o.isTexture?e.uniforms[s]={type:"t",value:o.toJSON(t).uuid}:o&&o.isColor?e.uniforms[s]={type:"c",value:o.getHex()}:o&&o.isVector2?e.uniforms[s]={type:"v2",value:o.toArray()}:o&&o.isVector3?e.uniforms[s]={type:"v3",value:o.toArray()}:o&&o.isVector4?e.uniforms[s]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?e.uniforms[s]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?e.uniforms[s]={type:"m4",value:o.toArray()}:e.uniforms[s]={value:o}}Object.keys(this.defines).length>0&&(e.defines=this.defines),e.vertexShader=this.vertexShader,e.fragmentShader=this.fragmentShader,e.lights=this.lights,e.clipping=this.clipping;let n={};for(let s in this.extensions)this.extensions[s]===!0&&(n[s]=!0);return Object.keys(n).length>0&&(e.extensions=n),e}fromJSON(t,e){if(super.fromJSON(t,e),t.uniforms!==void 0)for(let n in t.uniforms){let s=t.uniforms[n];switch(this.uniforms[n]={},s.type){case"t":this.uniforms[n].value=e[s.value]||null;break;case"c":this.uniforms[n].value=new Gt().setHex(s.value);break;case"v2":this.uniforms[n].value=new Yt().fromArray(s.value);break;case"v3":this.uniforms[n].value=new N().fromArray(s.value);break;case"v4":this.uniforms[n].value=new pe().fromArray(s.value);break;case"m3":this.uniforms[n].value=new Ht().fromArray(s.value);break;case"m4":this.uniforms[n].value=new fe().fromArray(s.value);break;default:this.uniforms[n].value=s.value}}if(t.defines!==void 0&&(this.defines=t.defines),t.vertexShader!==void 0&&(this.vertexShader=t.vertexShader),t.fragmentShader!==void 0&&(this.fragmentShader=t.fragmentShader),t.glslVersion!==void 0&&(this.glslVersion=t.glslVersion),t.extensions!==void 0)for(let n in t.extensions)this.extensions[n]=t.extensions[n];return t.lights!==void 0&&(this.lights=t.lights),t.clipping!==void 0&&(this.clipping=t.clipping),this}},Cr=class extends Ye{constructor(t){super(t),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}},Wi=class extends Xn{constructor(t){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new Gt(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Gt(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Ro,this.normalScale=new Yt(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Cn,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.defines={STANDARD:""},this.color.copy(t.color),this.roughness=t.roughness,this.metalness=t.metalness,this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.roughnessMap=t.roughnessMap,this.metalnessMap=t.metalnessMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.envMapIntensity=t.envMapIntensity,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}};var Rr=class extends Xn{constructor(t){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=yc,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}},Ir=class extends Xn{constructor(t){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}};function ar(i,t){return!i||i.constructor===t?i:typeof t.BYTES_PER_ELEMENT=="number"?new t(i):Array.prototype.slice.call(i)}var qn=class{constructor(t,e,n,s){this.parameterPositions=t,this._cachedIndex=0,this.resultBuffer=s!==void 0?s:new e.constructor(n),this.sampleValues=e,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(t){let e=this.parameterPositions,n=this._cachedIndex,s=e[n],r=e[n-1];n:{t:{let o;e:{i:if(!(t<s)){for(let a=n+2;;){if(s===void 0){if(t<r)break i;return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(r=s,s=e[++n],t<s)break t}o=e.length;break e}if(!(t>=r)){let a=e[1];t<a&&(n=2,r=a);for(let l=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(s=r,r=e[--n-1],t>=r)break t}o=n,n=0;break e}break n}for(;n<o;){let a=n+o>>>1;t<e[a]?o=a:n=a+1}if(s=e[n],r=e[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(s===void 0)return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,s)}return this.interpolate_(n,r,t,s)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(t){let e=this.resultBuffer,n=this.sampleValues,s=this.valueSize,r=t*s;for(let o=0;o!==s;++o)e[o]=n[r+o];return e}interpolate_(){throw new Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}},Pr=class extends qn{constructor(t,e,n,s){super(t,e,n,s),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:ma,endingEnd:ma}}intervalChanged_(t,e,n){let s=this.parameterPositions,r=t-2,o=t+1,a=s[r],l=s[o];if(a===void 0)switch(this.getSettings_().endingStart){case ga:r=t,a=2*e-n;break;case xa:r=s.length-2,a=e+s[r]-s[r+1];break;default:r=t,a=n}if(l===void 0)switch(this.getSettings_().endingEnd){case ga:o=t,l=2*n-e;break;case xa:o=1,l=n+s[1]-s[0];break;default:o=t-1,l=e}let c=(n-e)*.5,h=this.valueSize;this._weightPrev=c/(e-a),this._weightNext=c/(l-n),this._offsetPrev=r*h,this._offsetNext=o*h}interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=t*a,c=l-a,h=this._offsetPrev,d=this._offsetNext,u=this._weightPrev,f=this._weightNext,g=(n-e)/(s-e),v=g*g,m=v*g,p=-u*m+2*u*v-u*g,E=(1+u)*m+(-1.5-2*u)*v+(-.5+u)*g+1,C=(-1-f)*m+(1.5+f)*v+.5*g,S=f*m-f*v;for(let y=0;y!==a;++y)r[y]=p*o[h+y]+E*o[c+y]+C*o[l+y]+S*o[d+y];return r}},Lr=class extends qn{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=t*a,c=l-a,h=(n-e)/(s-e),d=1-h;for(let u=0;u!==a;++u)r[u]=o[c+u]*d+o[l+u]*h;return r}},Dr=class extends qn{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t){return this.copySampleValue_(t-1)}},Nr=class extends qn{interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=t*a,c=l-a,h=this.inTangents,d=this.outTangents;if(!h||!d){let g=(n-e)/(s-e),v=1-g;for(let m=0;m!==a;++m)r[m]=o[c+m]*v+o[l+m]*g;return r}let u=a*2,f=t-1;for(let g=0;g!==a;++g){let v=o[c+g],m=o[l+g],p=f*u+g*2,E=d[p],C=d[p+1],S=t*u+g*2,y=h[S],M=h[S+1],T=(n-e)/(s-e),x,w,R,I,D;for(let X=0;X<8;X++){x=T*T,w=x*T,R=1-T,I=R*R,D=I*R;let L=D*e+3*I*T*E+3*R*x*y+w*s-n;if(Math.abs(L)<1e-10)break;let k=3*I*(E-e)+6*R*T*(y-E)+3*x*(s-y);if(Math.abs(k)<1e-10)break;T=T-L/k,T=Math.max(0,Math.min(1,T))}r[g]=D*v+3*I*T*C+3*R*x*M+w*m}return r}},$e=class{constructor(t,e,n,s){if(t===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(e===void 0||e.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+t);this.name=t,this.times=ar(e,this.TimeBufferType),this.values=ar(n,this.ValueBufferType),this.setInterpolation(s||this.DefaultInterpolation)}static toJSON(t){let e=t.constructor,n;if(e.toJSON!==this.toJSON)n=e.toJSON(t);else{n={name:t.name,times:ar(t.times,Array),values:ar(t.values,Array)};let s=t.getInterpolation();s!==t.DefaultInterpolation&&(n.interpolation=s)}return n.type=t.ValueTypeName,n}InterpolantFactoryMethodDiscrete(t){return new Dr(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodLinear(t){return new Lr(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodSmooth(t){return new Pr(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodBezier(t){let e=new Nr(this.times,this.values,this.getValueSize(),t);return this.settings&&(e.inTangents=this.settings.inTangents,e.outTangents=this.settings.outTangents),e}setInterpolation(t){let e;switch(t){case as:e=this.InterpolantFactoryMethodDiscrete;break;case Mr:e=this.InterpolantFactoryMethodLinear;break;case hr:e=this.InterpolantFactoryMethodSmooth;break;case pa:e=this.InterpolantFactoryMethodBezier;break}if(e===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(t!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return Ft("KeyframeTrack:",n),this}return this.createInterpolant=e,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return as;case this.InterpolantFactoryMethodLinear:return Mr;case this.InterpolantFactoryMethodSmooth:return hr;case this.InterpolantFactoryMethodBezier:return pa}}getValueSize(){return this.values.length/this.times.length}shift(t){if(t!==0){let e=this.times;for(let n=0,s=e.length;n!==s;++n)e[n]+=t}return this}scale(t){if(t!==1){let e=this.times;for(let n=0,s=e.length;n!==s;++n)e[n]*=t}return this}trim(t,e){let n=this.times,s=n.length,r=0,o=s-1;for(;r!==s&&n[r]<t;)++r;for(;o!==-1&&n[o]>e;)--o;if(++o,r!==0||o!==s){r>=o&&(o=Math.max(o,1),r=o-1);let a=this.getValueSize();this.times=n.slice(r,o),this.values=this.values.slice(r*a,o*a)}return this}validate(){let t=!0,e=this.getValueSize();e-Math.floor(e)!==0&&(zt("KeyframeTrack: Invalid value size in track.",this),t=!1);let n=this.times,s=this.values,r=n.length;r===0&&(zt("KeyframeTrack: Track is empty.",this),t=!1);let o=null;for(let a=0;a!==r;a++){let l=n[a];if(typeof l=="number"&&isNaN(l)){zt("KeyframeTrack: Time is not a valid number.",this,a,l),t=!1;break}if(o!==null&&o>l){zt("KeyframeTrack: Out of order keys.",this,a,l,o),t=!1;break}o=l}if(s!==void 0&&Dh(s))for(let a=0,l=s.length;a!==l;++a){let c=s[a];if(isNaN(c)){zt("KeyframeTrack: Value is not a valid number.",this,a,c),t=!1;break}}return t}optimize(){let t=this.times.slice(),e=this.values.slice(),n=this.getValueSize(),s=this.getInterpolation()===hr,r=t.length-1,o=1;for(let a=1;a<r;++a){let l=!1,c=t[a],h=t[a+1];if(c!==h&&(a!==1||c!==t[0]))if(s)l=!0;else{let d=a*n,u=d-n,f=d+n;for(let g=0;g!==n;++g){let v=e[d+g];if(v!==e[u+g]||v!==e[f+g]){l=!0;break}}}if(l){if(a!==o){t[o]=t[a];let d=a*n,u=o*n;for(let f=0;f!==n;++f)e[u+f]=e[d+f]}++o}}if(r>0){t[o]=t[r];for(let a=r*n,l=o*n,c=0;c!==n;++c)e[l+c]=e[a+c];++o}return o!==t.length?(this.times=t.slice(0,o),this.values=e.slice(0,o*n)):(this.times=t,this.values=e),this}clone(){let t=this.times.slice(),e=this.values.slice(),n=this.constructor,s=new n(this.name,t,e);return s.createInterpolant=this.createInterpolant,s}};$e.prototype.ValueTypeName="";$e.prototype.TimeBufferType=Float32Array;$e.prototype.ValueBufferType=Float32Array;$e.prototype.DefaultInterpolation=Mr;var Yn=class extends $e{constructor(t,e,n){super(t,e,n)}};Yn.prototype.ValueTypeName="bool";Yn.prototype.ValueBufferType=Array;Yn.prototype.DefaultInterpolation=as;Yn.prototype.InterpolantFactoryMethodLinear=void 0;Yn.prototype.InterpolantFactoryMethodSmooth=void 0;var Ur=class extends $e{constructor(t,e,n,s){super(t,e,n,s)}};Ur.prototype.ValueTypeName="color";var Fr=class extends $e{constructor(t,e,n,s){super(t,e,n,s)}};Fr.prototype.ValueTypeName="number";var Or=class extends qn{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=(n-e)/(s-e),c=t*a;for(let h=c+a;c!==h;c+=4)je.slerpFlat(r,0,o,c-a,o,c,l);return r}},bs=class extends $e{constructor(t,e,n,s){super(t,e,n,s)}InterpolantFactoryMethodLinear(t){return new Or(this.times,this.values,this.getValueSize(),t)}};bs.prototype.ValueTypeName="quaternion";bs.prototype.InterpolantFactoryMethodSmooth=void 0;var $n=class extends $e{constructor(t,e,n){super(t,e,n)}};$n.prototype.ValueTypeName="string";$n.prototype.ValueBufferType=Array;$n.prototype.DefaultInterpolation=as;$n.prototype.InterpolantFactoryMethodLinear=void 0;$n.prototype.InterpolantFactoryMethodSmooth=void 0;var Br=class extends $e{constructor(t,e,n,s){super(t,e,n,s)}};Br.prototype.ValueTypeName="vector";var zr=class{constructor(t,e,n){let s=this,r=!1,o=0,a=0,l,c=[];this.onStart=void 0,this.onLoad=t,this.onProgress=e,this.onError=n,this._abortController=null,this.itemStart=function(h){a++,r===!1&&s.onStart!==void 0&&s.onStart(h,o,a),r=!0},this.itemEnd=function(h){o++,s.onProgress!==void 0&&s.onProgress(h,o,a),o===a&&(r=!1,s.onLoad!==void 0&&s.onLoad())},this.itemError=function(h){s.onError!==void 0&&s.onError(h)},this.resolveURL=function(h){return h=h.normalize("NFC"),l?l(h):h},this.setURLModifier=function(h){return l=h,this},this.addHandler=function(h,d){return c.push(h,d),this},this.removeHandler=function(h){let d=c.indexOf(h);return d!==-1&&c.splice(d,2),this},this.getHandler=function(h){for(let d=0,u=c.length;d<u;d+=2){let f=c[d],g=c[d+1];if(f.global&&(f.lastIndex=0),f.test(h))return g}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||(this._abortController=new AbortController),this._abortController}},Nc=new zr,kr=class{constructor(t){this.manager=t!==void 0?t:Nc,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(t,e){let n=this;return new Promise(function(s,r){n.load(t,s,e,r)})}parse(){}setCrossOrigin(t){return this.crossOrigin=t,this}setWithCredentials(t){return this.withCredentials=t,this}setPath(t){return this.path=t,this}setResourcePath(t){return this.resourcePath=t,this}setRequestHeader(t){return this.requestHeader=t,this}abort(){return this}};kr.DEFAULT_MATERIAL_NAME="__DEFAULT";var Ms=class extends Pe{constructor(t,e=1){super(),this.isLight=!0,this.type="Light",this.color=new Gt(t),this.intensity=e}dispose(){this.dispatchEvent({type:"dispose"})}copy(t,e){return super.copy(t,e),this.color.copy(t.color),this.intensity=t.intensity,this}toJSON(t){let e=super.toJSON(t);return e.object.color=this.color.getHex(),e.object.intensity=this.intensity,e}},Ss=class extends Ms{constructor(t,e,n){super(t,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(Pe.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Gt(e)}copy(t,e){return super.copy(t,e),this.groundColor.copy(t.groundColor),this}toJSON(t){let e=super.toJSON(t);return e.object.groundColor=this.groundColor.getHex(),e}},fa=new fe,Wl=new N,Xl=new N,ya=class{constructor(t){this.camera=t,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new Yt(512,512),this.mapType=Be,this.map=null,this.mapPass=null,this.matrix=new fe,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new ki,this._frameExtents=new Yt(1,1),this._viewportCount=1,this._viewports=[new pe(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(t){let e=this.camera,n=this.matrix;Wl.setFromMatrixPosition(t.matrixWorld),e.position.copy(Wl),Xl.setFromMatrixPosition(t.target.matrixWorld),e.lookAt(Xl),e.updateMatrixWorld(),fa.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),this._frustum.setFromProjectionMatrix(fa,e.coordinateSystem,e.reversedDepth),e.coordinateSystem===Di||e.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(fa)}getViewport(t){return this._viewports[t]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(t){return this.camera=t.camera.clone(),this.intensity=t.intensity,this.bias=t.bias,this.radius=t.radius,this.autoUpdate=t.autoUpdate,this.needsUpdate=t.needsUpdate,this.normalBias=t.normalBias,this.blurSamples=t.blurSamples,this.mapSize.copy(t.mapSize),this.biasNode=t.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){let t={};return this.intensity!==1&&(t.intensity=this.intensity),this.bias!==0&&(t.bias=this.bias),this.normalBias!==0&&(t.normalBias=this.normalBias),this.radius!==1&&(t.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(t.mapSize=this.mapSize.toArray()),t.camera=this.camera.toJSON(!1).object,delete t.camera.matrix,t}},lr=new N,cr=new je,dn=new N,Es=class extends Pe{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new fe,this.projectionMatrix=new fe,this.projectionMatrixInverse=new fe,this.coordinateSystem=sn,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(t,e){return super.copy(t,e),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorld.decompose(lr,cr,dn),dn.x===1&&dn.y===1&&dn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(lr,cr,dn.set(1,1,1)).invert()}updateWorldMatrix(t,e,n=!1){super.updateWorldMatrix(t,e,n),this.matrixWorld.decompose(lr,cr,dn),dn.x===1&&dn.y===1&&dn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(lr,cr,dn.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}},Vn=new N,ql=new Yt,Yl=new Yt,Ie=class extends Es{constructor(t=50,e=1,n=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=n,this.far=s,this.focus=10,this.aspect=e,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){let e=.5*this.getFilmHeight()/t;this.fov=Ui*2*Math.atan(e),this.updateProjectionMatrix()}getFocalLength(){let t=Math.tan(rs*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return Ui*2*Math.atan(Math.tan(rs*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,e,n){Vn.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),e.set(Vn.x,Vn.y).multiplyScalar(-t/Vn.z),Vn.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Vn.x,Vn.y).multiplyScalar(-t/Vn.z)}getViewSize(t,e){return this.getViewBounds(t,ql,Yl),e.subVectors(Yl,ql)}setViewOffset(t,e,n,s,r,o){this.aspect=t/e,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=this.near,e=t*Math.tan(rs*.5*this.fov)/this.zoom,n=2*e,s=this.aspect*n,r=-.5*s,o=this.view;if(this.view!==null&&this.view.enabled){let l=o.fullWidth,c=o.fullHeight;r+=o.offsetX*s/l,e-=o.offsetY*n/c,s*=o.width/l,n*=o.height/c}let a=this.filmOffset;a!==0&&(r+=t*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,e,e-n,t,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.fov=this.fov,e.object.zoom=this.zoom,e.object.near=this.near,e.object.far=this.far,e.object.focus=this.focus,e.object.aspect=this.aspect,this.view!==null&&(e.object.view=Object.assign({},this.view)),e.object.filmGauge=this.filmGauge,e.object.filmOffset=this.filmOffset,e}};var Xi=class extends Es{constructor(t=-1,e=1,n=1,s=-1,r=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=e,this.top=n,this.bottom=s,this.near=r,this.far=o,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,e,n,s,r,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=(this.right-this.left)/(2*this.zoom),e=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,s=(this.top+this.bottom)/2,r=n-t,o=n+t,a=s+e,l=s-e;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,o=r+c*this.view.width,a-=h*this.view.offsetY,l=a-h*this.view.height}this.projectionMatrix.makeOrthographic(r,o,a,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.zoom=this.zoom,e.object.left=this.left,e.object.right=this.right,e.object.top=this.top,e.object.bottom=this.bottom,e.object.near=this.near,e.object.far=this.far,this.view!==null&&(e.object.view=Object.assign({},this.view)),e}},ba=class extends ya{constructor(){super(new Xi(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},qi=class extends Ms{constructor(t,e){super(t,e),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(Pe.DEFAULT_UP),this.updateMatrix(),this.target=new Pe,this.shadow=new ba}dispose(){super.dispose(),this.shadow.dispose()}copy(t){return super.copy(t),this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}toJSON(t){let e=super.toJSON(t);return e.object.shadow=this.shadow.toJSON(),e.object.target=this.target.uuid,e}};var Ri=-90,Ii=1,Vr=class extends Pe{constructor(t,e,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let s=new Ie(Ri,Ii,t,e);s.layers=this.layers,this.add(s);let r=new Ie(Ri,Ii,t,e);r.layers=this.layers,this.add(r);let o=new Ie(Ri,Ii,t,e);o.layers=this.layers,this.add(o);let a=new Ie(Ri,Ii,t,e);a.layers=this.layers,this.add(a);let l=new Ie(Ri,Ii,t,e);l.layers=this.layers,this.add(l);let c=new Ie(Ri,Ii,t,e);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let t=this.coordinateSystem,e=this.children.concat(),[n,s,r,o,a,l]=e;for(let c of e)this.remove(c);if(t===sn)n.up.set(0,1,0),n.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(t===Di)n.up.set(0,-1,0),n.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(let c of e)this.add(c),c.updateMatrixWorld()}update(t,e){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:s}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());let[r,o,a,l,c,h]=this.children,d=t.getRenderTarget(),u=t.getActiveCubeFace(),f=t.getActiveMipmapLevel(),g=t.xr.enabled;t.xr.enabled=!1;let v=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let m=!1;t.isWebGLRenderer===!0?m=t.state.buffers.depth.getReversed():m=t.reversedDepthBuffer,t.setRenderTarget(n,0,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,r),t.setRenderTarget(n,1,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,o),t.setRenderTarget(n,2,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,a),t.setRenderTarget(n,3,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,l),t.setRenderTarget(n,4,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,c),n.texture.generateMipmaps=v,t.setRenderTarget(n,5,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,h),t.setRenderTarget(d,u,f),t.xr.enabled=g,n.texture.needsPMREMUpdate=!0}},Hr=class extends Ie{constructor(t=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=t}};var Za="\\[\\]\\.:\\/",xu=new RegExp("["+Za+"]","g"),Ja="[^"+Za+"]",_u="[^"+Za.replace("\\.","")+"]",vu=/((?:WC+[\/:])*)/.source.replace("WC",Ja),yu=/(WCOD+)?/.source.replace("WCOD",_u),bu=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Ja),Mu=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Ja),Su=new RegExp("^"+vu+yu+bu+Mu+"$"),Eu=["material","materials","bones","map"],Ma=class{constructor(t,e,n){let s=n||he.parseTrackName(e);this._targetGroup=t,this._bindings=t.subscribe_(e,s)}getValue(t,e){this.bind();let n=this._targetGroup.nCachedObjects_,s=this._bindings[n];s!==void 0&&s.getValue(t,e)}setValue(t,e){let n=this._bindings;for(let s=this._targetGroup.nCachedObjects_,r=n.length;s!==r;++s)n[s].setValue(t,e)}bind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].bind()}unbind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].unbind()}},he=class i{constructor(t,e,n){this.path=e,this.parsedPath=n||i.parseTrackName(e),this.node=i.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,e,n){return t&&t.isAnimationObjectGroup?new i.Composite(t,e,n):new i(t,e,n)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace(xu,"")}static parseTrackName(t){let e=Su.exec(t);if(e===null)throw new Error("THREE.PropertyBinding: Cannot parse trackName: "+t);let n={nodeName:e[2],objectName:e[3],objectIndex:e[4],propertyName:e[5],propertyIndex:e[6]},s=n.nodeName&&n.nodeName.lastIndexOf(".");if(s!==void 0&&s!==-1){let r=n.nodeName.substring(s+1);Eu.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,s),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+t);return n}static findNode(t,e){if(e===void 0||e===""||e==="."||e===-1||e===t.name||e===t.uuid)return t;if(t.skeleton){let n=t.skeleton.getBoneByName(e);if(n!==void 0)return n}if(t.children){let n=function(r){for(let o=0;o<r.length;o++){let a=r[o];if(a.name===e||a.uuid===e)return a;let l=n(a.children);if(l)return l}return null},s=n(t.children);if(s)return s}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,e){t[e]=this.targetObject[this.propertyName]}_getValue_array(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)t[e++]=n[s]}_getValue_arrayElement(t,e){t[e]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,e){this.resolvedProperty.toArray(t,e)}_setValue_direct(t,e){this.targetObject[this.propertyName]=t[e]}_setValue_direct_setNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++]}_setValue_array_setNeedsUpdate(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,e){this.resolvedProperty[this.propertyIndex]=t[e]}_setValue_arrayElement_setNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,e){this.resolvedProperty.fromArray(t,e)}_setValue_fromArray_setNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,e){this.bind(),this.getValue(t,e)}_setValue_unbound(t,e){this.bind(),this.setValue(t,e)}bind(){let t=this.node,e=this.parsedPath,n=e.objectName,s=e.propertyName,r=e.propertyIndex;if(t||(t=i.findNode(this.rootNode,e.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){Ft("PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let c=e.objectIndex;switch(n){case"materials":if(!t.material){zt("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){zt("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){zt("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let h=0;h<t.length;h++)if(t[h].name===c){c=h;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){zt("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){zt("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[n]===void 0){zt("PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[n]}if(c!==void 0){if(t[c]===void 0){zt("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[c]}}let o=t[s];if(o===void 0){let c=e.nodeName;zt("PropertyBinding: Trying to update property for track: "+c+"."+s+" but it wasn't found.",t);return}let a=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?a=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(a=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(r!==void 0){if(s==="morphTargetInfluences"){if(!t.geometry){zt("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){zt("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[r]!==void 0&&(r=t.morphTargetDictionary[r])}l=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=r}else o.fromArray!==void 0&&o.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(l=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=s;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][a]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};he.Composite=Ma;he.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};he.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};he.prototype.GetterByBindingType=[he.prototype._getValue_direct,he.prototype._getValue_array,he.prototype._getValue_arrayElement,he.prototype._getValue_toArray];he.prototype.SetterByBindingTypeAndVersioning=[[he.prototype._setValue_direct,he.prototype._setValue_direct_setNeedsUpdate,he.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[he.prototype._setValue_array,he.prototype._setValue_array_setNeedsUpdate,he.prototype._setValue_array_setMatrixWorldNeedsUpdate],[he.prototype._setValue_arrayElement,he.prototype._setValue_arrayElement_setNeedsUpdate,he.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[he.prototype._setValue_fromArray,he.prototype._setValue_fromArray_setNeedsUpdate,he.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var Jg=new Float32Array(1);var $l=new fe,ws=class{constructor(t,e,n=0,s=1/0){this.ray=new gs(t,e),this.near=n,this.far=s,this.camera=null,this.layers=new Oi,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(t,e){this.ray.set(t,e)}setFromCamera(t,e){e.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(t.x,t.y,.5).unproject(e).sub(this.ray.origin).normalize(),this.camera=e):e.isOrthographicCamera?(this.ray.origin.set(t.x,t.y,e.projectionMatrix.elements[14]).unproject(e),this.ray.direction.set(0,0,-1).transformDirection(e.matrixWorld),this.camera=e):zt("Raycaster: Unsupported camera type: "+e.type)}setFromXRController(t){return $l.identity().extractRotation(t.matrixWorld),this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4($l),this}intersectObject(t,e=!0,n=[]){return Sa(t,this,n,e),n.sort(Zl),n}intersectObjects(t,e=!0,n=[]){for(let s=0,r=t.length;s<r;s++)Sa(t[s],this,n,e);return n.sort(Zl),n}};function Zl(i,t){return i.distance-t.distance}function Sa(i,t,e,n){let s=!0;if(i.layers.test(t.layers)&&i.raycast(t,e)===!1&&(s=!1),s===!0&&n===!0){let r=i.children;for(let o=0,a=r.length;o<a;o++)Sa(r[o],t,e,!0)}}var Ea=class i{static{i.prototype.isMatrix2=!0}constructor(t,e,n,s){this.elements=[1,0,0,1],t!==void 0&&this.set(t,e,n,s)}identity(){return this.set(1,0,0,1),this}fromArray(t,e=0){for(let n=0;n<4;n++)this.elements[n]=t[n+e];return this}set(t,e,n,s){let r=this.elements;return r[0]=t,r[2]=e,r[1]=n,r[3]=s,this}};function Ka(i,t,e,n){let s=wu(n);switch(e){case Ha:return i*t;case Wa:return i*t/s.components*s.byteLength;case Zr:return i*t/s.components*s.byteLength;case jn:return i*t*2/s.components*s.byteLength;case Jr:return i*t*2/s.components*s.byteLength;case Ga:return i*t*3/s.components*s.byteLength;case Qe:return i*t*4/s.components*s.byteLength;case Kr:return i*t*4/s.components*s.byteLength;case Rs:case Is:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case Ps:case Ls:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case Qr:case eo:return Math.max(i,16)*Math.max(t,8)/4;case jr:case to:return Math.max(i,8)*Math.max(t,8)/2;case no:case io:case ro:case oo:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case so:case Ds:case ao:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case lo:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case co:return Math.floor((i+4)/5)*Math.floor((t+3)/4)*16;case ho:return Math.floor((i+4)/5)*Math.floor((t+4)/5)*16;case uo:return Math.floor((i+5)/6)*Math.floor((t+4)/5)*16;case fo:return Math.floor((i+5)/6)*Math.floor((t+5)/6)*16;case po:return Math.floor((i+7)/8)*Math.floor((t+4)/5)*16;case mo:return Math.floor((i+7)/8)*Math.floor((t+5)/6)*16;case go:return Math.floor((i+7)/8)*Math.floor((t+7)/8)*16;case xo:return Math.floor((i+9)/10)*Math.floor((t+4)/5)*16;case _o:return Math.floor((i+9)/10)*Math.floor((t+5)/6)*16;case vo:return Math.floor((i+9)/10)*Math.floor((t+7)/8)*16;case yo:return Math.floor((i+9)/10)*Math.floor((t+9)/10)*16;case bo:return Math.floor((i+11)/12)*Math.floor((t+9)/10)*16;case Mo:return Math.floor((i+11)/12)*Math.floor((t+11)/12)*16;case So:case Eo:case wo:return Math.ceil(i/4)*Math.ceil(t/4)*16;case To:case Ao:return Math.ceil(i/4)*Math.ceil(t/4)*8;case Ns:case Co:return Math.ceil(i/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${e} format.`)}function wu(i){switch(i){case Be:case Ba:return{byteLength:1,components:1};case $i:case za:case xn:return{byteLength:2,components:1};case Yr:case $r:return{byteLength:2,components:4};case on:case qr:case an:return{byteLength:4,components:1};case ka:case Va:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${i}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"185"}}));typeof window<"u"&&(window.__THREE__?Ft("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="185");function ih(){let i=null,t=!1,e=null,n=null;function s(r,o){e(r,o),n=i.requestAnimationFrame(s)}return{start:function(){t!==!0&&e!==null&&i!==null&&(n=i.requestAnimationFrame(s),t=!0)},stop:function(){i!==null&&i.cancelAnimationFrame(n),t=!1},setAnimationLoop:function(r){e=r},setContext:function(r){i=r}}}function Au(i){let t=new WeakMap;function e(a,l){let c=a.array,h=a.usage,d=c.byteLength,u=i.createBuffer();i.bindBuffer(l,u),i.bufferData(l,c,h),a.onUploadCallback();let f;if(c instanceof Float32Array)f=i.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)f=i.HALF_FLOAT;else if(c instanceof Uint16Array)a.isFloat16BufferAttribute?f=i.HALF_FLOAT:f=i.UNSIGNED_SHORT;else if(c instanceof Int16Array)f=i.SHORT;else if(c instanceof Uint32Array)f=i.UNSIGNED_INT;else if(c instanceof Int32Array)f=i.INT;else if(c instanceof Int8Array)f=i.BYTE;else if(c instanceof Uint8Array)f=i.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)f=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:u,type:f,bytesPerElement:c.BYTES_PER_ELEMENT,version:a.version,size:d}}function n(a,l,c){let h=l.array,d=l.updateRanges;if(i.bindBuffer(c,a),d.length===0)i.bufferSubData(c,0,h);else{d.sort((f,g)=>f.start-g.start);let u=0;for(let f=1;f<d.length;f++){let g=d[u],v=d[f];v.start<=g.start+g.count+1?g.count=Math.max(g.count,v.start+v.count-g.start):(++u,d[u]=v)}d.length=u+1;for(let f=0,g=d.length;f<g;f++){let v=d[f];i.bufferSubData(c,v.start*h.BYTES_PER_ELEMENT,h,v.start,v.count)}l.clearUpdateRanges()}l.onUploadCallback()}function s(a){return a.isInterleavedBufferAttribute&&(a=a.data),t.get(a)}function r(a){a.isInterleavedBufferAttribute&&(a=a.data);let l=t.get(a);l&&(i.deleteBuffer(l.buffer),t.delete(a))}function o(a,l){if(a.isInterleavedBufferAttribute&&(a=a.data),a.isGLBufferAttribute){let h=t.get(a);(!h||h.version<a.version)&&t.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}let c=t.get(a);if(c===void 0)t.set(a,e(a,l));else if(c.version<a.version){if(c.size!==a.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,a,l),c.version=a.version}}return{get:s,remove:r,update:o}}var Cu=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Ru=`#ifdef USE_ALPHAHASH
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
#endif`,Iu=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,Pu=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Lu=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,Du=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,Nu=`#ifdef USE_AOMAP
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
#endif`,Uu=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,Fu=`#ifdef USE_BATCHING
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
#endif`,Ou=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Bu=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,zu=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,ku=`float G_BlinnPhong_Implicit( ) {
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
} // validated`,Vu=`#ifdef USE_IRIDESCENCE
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
#endif`,Hu=`#ifdef USE_BUMPMAP
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
#endif`,Gu=`#if NUM_CLIPPING_PLANES > 0
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
#endif`,Wu=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,Xu=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,qu=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,Yu=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,$u=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,Zu=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,Ju=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
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
#endif`,Ku=`#define PI 3.141592653589793
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
} // validated`,ju=`#ifdef ENVMAP_TYPE_CUBE_UV
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
#endif`,Qu=`vec3 transformedNormal = objectNormal;
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
#endif`,td=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,ed=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,nd=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,id=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,sd="gl_FragColor = linearToOutputTexel( gl_FragColor );",rd=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,od=`#ifdef USE_ENVMAP
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
#endif`,ad=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,ld=`#ifdef USE_ENVMAP
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
#endif`,cd=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,hd=`#ifdef USE_ENVMAP
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
#endif`,ud=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,dd=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,fd=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,pd=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,md=`#ifdef USE_GRADIENTMAP
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
}`,gd=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,xd=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,_d=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,vd=`uniform bool receiveShadow;
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
#include <lightprobes_pars_fragment>`,yd=`#ifdef USE_ENVMAP
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
#endif`,bd=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Md=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Sd=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Ed=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,wd=`PhysicalMaterial material;
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
#endif`,Td=`uniform sampler2D dfgLUT;
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
}`,Ad=`
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
#endif`,Cd=`#if defined( RE_IndirectDiffuse )
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
#endif`,Rd=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Id=`#ifdef USE_LIGHT_PROBES_GRID
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
#endif`,Pd=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,Ld=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Dd=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Nd=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,Ud=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,Fd=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,Od=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
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
#endif`,Bd=`#if defined( USE_POINTS_UV )
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
#endif`,zd=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,kd=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,Vd=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,Hd=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,Gd=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Wd=`#ifdef USE_MORPHTARGETS
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
#endif`,Xd=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,qd=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
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
vec3 nonPerturbedNormal = normal;`,Yd=`#ifdef USE_NORMALMAP_OBJECTSPACE
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
#endif`,$d=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Zd=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Jd=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,Kd=`#ifdef USE_NORMALMAP
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
#endif`,jd=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,Qd=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,tf=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,ef=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,nf=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,sf=`vec3 packNormalToRGB( const in vec3 normal ) {
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
}`,rf=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,of=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,af=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,lf=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,cf=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,hf=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,uf=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,df=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,ff=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
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
#endif`,pf=`float getShadowMask() {
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
}`,mf=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,gf=`#ifdef USE_SKINNING
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
#endif`,xf=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,_f=`#ifdef USE_SKINNING
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
#endif`,vf=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,yf=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,bf=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Mf=`#ifndef saturate
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
vec3 CustomToneMapping( vec3 color ) { return color; }`,Sf=`#ifdef USE_TRANSMISSION
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
#endif`,Ef=`#ifdef USE_TRANSMISSION
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
#endif`,wf=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Tf=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Af=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Cf=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,Rf=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,If=`uniform sampler2D t2D;
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
}`,Pf=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Lf=`#ifdef ENVMAP_TYPE_CUBE
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
}`,Df=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Nf=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Uf=`#include <common>
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
}`,Ff=`#if DEPTH_PACKING == 3200
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
}`,Of=`#define DISTANCE
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
}`,Bf=`#define DISTANCE
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
}`,zf=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,kf=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Vf=`uniform float scale;
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
}`,Hf=`uniform vec3 diffuse;
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
}`,Gf=`#include <common>
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
}`,Wf=`uniform vec3 diffuse;
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
}`,Xf=`#define LAMBERT
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
}`,qf=`#define LAMBERT
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
}`,Yf=`#define MATCAP
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
}`,$f=`#define MATCAP
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
}`,Zf=`#define NORMAL
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
}`,Jf=`#define NORMAL
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
}`,Kf=`#define PHONG
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
}`,jf=`#define PHONG
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
}`,Qf=`#define STANDARD
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
}`,tp=`#define STANDARD
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
}`,ep=`#define TOON
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
}`,np=`#define TOON
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
}`,ip=`uniform float size;
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
}`,sp=`uniform vec3 diffuse;
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
}`,rp=`#include <common>
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
}`,op=`uniform vec3 color;
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
}`,ap=`uniform float rotation;
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
}`,lp=`uniform vec3 diffuse;
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
}`,$t={alphahash_fragment:Cu,alphahash_pars_fragment:Ru,alphamap_fragment:Iu,alphamap_pars_fragment:Pu,alphatest_fragment:Lu,alphatest_pars_fragment:Du,aomap_fragment:Nu,aomap_pars_fragment:Uu,batching_pars_vertex:Fu,batching_vertex:Ou,begin_vertex:Bu,beginnormal_vertex:zu,bsdfs:ku,iridescence_fragment:Vu,bumpmap_pars_fragment:Hu,clipping_planes_fragment:Gu,clipping_planes_pars_fragment:Wu,clipping_planes_pars_vertex:Xu,clipping_planes_vertex:qu,color_fragment:Yu,color_pars_fragment:$u,color_pars_vertex:Zu,color_vertex:Ju,common:Ku,cube_uv_reflection_fragment:ju,defaultnormal_vertex:Qu,displacementmap_pars_vertex:td,displacementmap_vertex:ed,emissivemap_fragment:nd,emissivemap_pars_fragment:id,colorspace_fragment:sd,colorspace_pars_fragment:rd,envmap_fragment:od,envmap_common_pars_fragment:ad,envmap_pars_fragment:ld,envmap_pars_vertex:cd,envmap_physical_pars_fragment:yd,envmap_vertex:hd,fog_vertex:ud,fog_pars_vertex:dd,fog_fragment:fd,fog_pars_fragment:pd,gradientmap_pars_fragment:md,lightmap_pars_fragment:gd,lights_lambert_fragment:xd,lights_lambert_pars_fragment:_d,lights_pars_begin:vd,lights_toon_fragment:bd,lights_toon_pars_fragment:Md,lights_phong_fragment:Sd,lights_phong_pars_fragment:Ed,lights_physical_fragment:wd,lights_physical_pars_fragment:Td,lights_fragment_begin:Ad,lights_fragment_maps:Cd,lights_fragment_end:Rd,lightprobes_pars_fragment:Id,logdepthbuf_fragment:Pd,logdepthbuf_pars_fragment:Ld,logdepthbuf_pars_vertex:Dd,logdepthbuf_vertex:Nd,map_fragment:Ud,map_pars_fragment:Fd,map_particle_fragment:Od,map_particle_pars_fragment:Bd,metalnessmap_fragment:zd,metalnessmap_pars_fragment:kd,morphinstance_vertex:Vd,morphcolor_vertex:Hd,morphnormal_vertex:Gd,morphtarget_pars_vertex:Wd,morphtarget_vertex:Xd,normal_fragment_begin:qd,normal_fragment_maps:Yd,normal_pars_fragment:$d,normal_pars_vertex:Zd,normal_vertex:Jd,normalmap_pars_fragment:Kd,clearcoat_normal_fragment_begin:jd,clearcoat_normal_fragment_maps:Qd,clearcoat_pars_fragment:tf,iridescence_pars_fragment:ef,opaque_fragment:nf,packing:sf,premultiplied_alpha_fragment:rf,project_vertex:of,dithering_fragment:af,dithering_pars_fragment:lf,roughnessmap_fragment:cf,roughnessmap_pars_fragment:hf,shadowmap_pars_fragment:uf,shadowmap_pars_vertex:df,shadowmap_vertex:ff,shadowmask_pars_fragment:pf,skinbase_vertex:mf,skinning_pars_vertex:gf,skinning_vertex:xf,skinnormal_vertex:_f,specularmap_fragment:vf,specularmap_pars_fragment:yf,tonemapping_fragment:bf,tonemapping_pars_fragment:Mf,transmission_fragment:Sf,transmission_pars_fragment:Ef,uv_pars_fragment:wf,uv_pars_vertex:Tf,uv_vertex:Af,worldpos_vertex:Cf,background_vert:Rf,background_frag:If,backgroundCube_vert:Pf,backgroundCube_frag:Lf,cube_vert:Df,cube_frag:Nf,depth_vert:Uf,depth_frag:Ff,distance_vert:Of,distance_frag:Bf,equirect_vert:zf,equirect_frag:kf,linedashed_vert:Vf,linedashed_frag:Hf,meshbasic_vert:Gf,meshbasic_frag:Wf,meshlambert_vert:Xf,meshlambert_frag:qf,meshmatcap_vert:Yf,meshmatcap_frag:$f,meshnormal_vert:Zf,meshnormal_frag:Jf,meshphong_vert:Kf,meshphong_frag:jf,meshphysical_vert:Qf,meshphysical_frag:tp,meshtoon_vert:ep,meshtoon_frag:np,points_vert:ip,points_frag:sp,shadow_vert:rp,shadow_frag:op,sprite_vert:ap,sprite_frag:lp},pt={common:{diffuse:{value:new Gt(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Ht},alphaMap:{value:null},alphaMapTransform:{value:new Ht},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Ht}},envmap:{envMap:{value:null},envMapRotation:{value:new Ht},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Ht}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Ht}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Ht},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Ht},normalScale:{value:new Yt(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Ht},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Ht}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Ht}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Ht}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Gt(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new N},probesMax:{value:new N},probesResolution:{value:new N}},points:{diffuse:{value:new Gt(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Ht},alphaTest:{value:0},uvTransform:{value:new Ht}},sprite:{diffuse:{value:new Gt(16777215)},opacity:{value:1},center:{value:new Yt(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Ht},alphaMap:{value:null},alphaMapTransform:{value:new Ht},alphaTest:{value:0}}},vn={basic:{uniforms:Le([pt.common,pt.specularmap,pt.envmap,pt.aomap,pt.lightmap,pt.fog]),vertexShader:$t.meshbasic_vert,fragmentShader:$t.meshbasic_frag},lambert:{uniforms:Le([pt.common,pt.specularmap,pt.envmap,pt.aomap,pt.lightmap,pt.emissivemap,pt.bumpmap,pt.normalmap,pt.displacementmap,pt.fog,pt.lights,{emissive:{value:new Gt(0)},envMapIntensity:{value:1}}]),vertexShader:$t.meshlambert_vert,fragmentShader:$t.meshlambert_frag},phong:{uniforms:Le([pt.common,pt.specularmap,pt.envmap,pt.aomap,pt.lightmap,pt.emissivemap,pt.bumpmap,pt.normalmap,pt.displacementmap,pt.fog,pt.lights,{emissive:{value:new Gt(0)},specular:{value:new Gt(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:$t.meshphong_vert,fragmentShader:$t.meshphong_frag},standard:{uniforms:Le([pt.common,pt.envmap,pt.aomap,pt.lightmap,pt.emissivemap,pt.bumpmap,pt.normalmap,pt.displacementmap,pt.roughnessmap,pt.metalnessmap,pt.fog,pt.lights,{emissive:{value:new Gt(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:$t.meshphysical_vert,fragmentShader:$t.meshphysical_frag},toon:{uniforms:Le([pt.common,pt.aomap,pt.lightmap,pt.emissivemap,pt.bumpmap,pt.normalmap,pt.displacementmap,pt.gradientmap,pt.fog,pt.lights,{emissive:{value:new Gt(0)}}]),vertexShader:$t.meshtoon_vert,fragmentShader:$t.meshtoon_frag},matcap:{uniforms:Le([pt.common,pt.bumpmap,pt.normalmap,pt.displacementmap,pt.fog,{matcap:{value:null}}]),vertexShader:$t.meshmatcap_vert,fragmentShader:$t.meshmatcap_frag},points:{uniforms:Le([pt.points,pt.fog]),vertexShader:$t.points_vert,fragmentShader:$t.points_frag},dashed:{uniforms:Le([pt.common,pt.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:$t.linedashed_vert,fragmentShader:$t.linedashed_frag},depth:{uniforms:Le([pt.common,pt.displacementmap]),vertexShader:$t.depth_vert,fragmentShader:$t.depth_frag},normal:{uniforms:Le([pt.common,pt.bumpmap,pt.normalmap,pt.displacementmap,{opacity:{value:1}}]),vertexShader:$t.meshnormal_vert,fragmentShader:$t.meshnormal_frag},sprite:{uniforms:Le([pt.sprite,pt.fog]),vertexShader:$t.sprite_vert,fragmentShader:$t.sprite_frag},background:{uniforms:{uvTransform:{value:new Ht},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:$t.background_vert,fragmentShader:$t.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Ht}},vertexShader:$t.backgroundCube_vert,fragmentShader:$t.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:$t.cube_vert,fragmentShader:$t.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:$t.equirect_vert,fragmentShader:$t.equirect_frag},distance:{uniforms:Le([pt.common,pt.displacementmap,{referencePosition:{value:new N},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:$t.distance_vert,fragmentShader:$t.distance_frag},shadow:{uniforms:Le([pt.lights,pt.fog,{color:{value:new Gt(0)},opacity:{value:1}}]),vertexShader:$t.shadow_vert,fragmentShader:$t.shadow_frag}};vn.physical={uniforms:Le([vn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Ht},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Ht},clearcoatNormalScale:{value:new Yt(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Ht},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Ht},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Ht},sheen:{value:0},sheenColor:{value:new Gt(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Ht},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Ht},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Ht},transmissionSamplerSize:{value:new Yt},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Ht},attenuationDistance:{value:0},attenuationColor:{value:new Gt(0)},specularColor:{value:new Gt(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Ht},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Ht},anisotropyVector:{value:new Yt},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Ht}}]),vertexShader:$t.meshphysical_vert,fragmentShader:$t.meshphysical_frag};var Lo={r:0,b:0,g:0},cp=new fe,sh=new Ht;sh.set(-1,0,0,0,1,0,0,0,1);function hp(i,t,e,n,s,r){let o=new Gt(0),a=s===!0?0:1,l,c,h=null,d=0,u=null;function f(E){let C=E.isScene===!0?E.background:null;if(C&&C.isTexture){let S=E.backgroundBlurriness>0;C=t.get(C,S)}return C}function g(E){let C=!1,S=f(E);S===null?m(o,a):S&&S.isColor&&(m(S,1),C=!0);let y=i.xr.getEnvironmentBlendMode();y==="additive"?e.buffers.color.setClear(0,0,0,1,r):y==="alpha-blend"&&e.buffers.color.setClear(0,0,0,0,r),(i.autoClear||C)&&(e.buffers.depth.setTest(!0),e.buffers.depth.setMask(!0),e.buffers.color.setMask(!0),i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil))}function v(E,C){let S=f(C);S&&(S.isCubeTexture||S.mapping===As)?(c===void 0&&(c=new ue(new Vi(1,1,1),new Ye({name:"BackgroundCubeMaterial",uniforms:di(vn.backgroundCube.uniforms),vertexShader:vn.backgroundCube.vertexShader,fragmentShader:vn.backgroundCube.fragmentShader,side:Te,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(y,M,T){this.matrixWorld.copyPosition(T.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(c)),c.material.uniforms.envMap.value=S,c.material.uniforms.backgroundBlurriness.value=C.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=C.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(cp.makeRotationFromEuler(C.backgroundRotation)).transpose(),S.isCubeTexture&&S.isRenderTargetTexture===!1&&c.material.uniforms.backgroundRotation.value.premultiply(sh),c.material.toneMapped=jt.getTransfer(S.colorSpace)!==ne,(h!==S||d!==S.version||u!==i.toneMapping)&&(c.material.needsUpdate=!0,h=S,d=S.version,u=i.toneMapping),c.layers.enableAll(),E.unshift(c,c.geometry,c.material,0,0,null)):S&&S.isTexture&&(l===void 0&&(l=new ue(new ys(2,2),new Ye({name:"BackgroundMaterial",uniforms:di(vn.background.uniforms),vertexShader:vn.background.vertexShader,fragmentShader:vn.background.fragmentShader,side:An,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(l)),l.material.uniforms.t2D.value=S,l.material.uniforms.backgroundIntensity.value=C.backgroundIntensity,l.material.toneMapped=jt.getTransfer(S.colorSpace)!==ne,S.matrixAutoUpdate===!0&&S.updateMatrix(),l.material.uniforms.uvTransform.value.copy(S.matrix),(h!==S||d!==S.version||u!==i.toneMapping)&&(l.material.needsUpdate=!0,h=S,d=S.version,u=i.toneMapping),l.layers.enableAll(),E.unshift(l,l.geometry,l.material,0,0,null))}function m(E,C){E.getRGB(Lo,$a(i)),e.buffers.color.setClear(Lo.r,Lo.g,Lo.b,C,r)}function p(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return o},setClearColor:function(E,C=1){o.set(E),a=C,m(o,a)},getClearAlpha:function(){return a},setClearAlpha:function(E){a=E,m(o,a)},render:g,addToRenderList:v,dispose:p}}function up(i,t){let e=i.getParameter(i.MAX_VERTEX_ATTRIBS),n={},s=u(null),r=s,o=!1;function a(I,D,X,W,L){let k=!1,z=d(I,W,X,D);r!==z&&(r=z,c(r.object)),k=f(I,W,X,L),k&&g(I,W,X,L),L!==null&&t.update(L,i.ELEMENT_ARRAY_BUFFER),(k||o)&&(o=!1,S(I,D,X,W),L!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,t.get(L).buffer))}function l(){return i.createVertexArray()}function c(I){return i.bindVertexArray(I)}function h(I){return i.deleteVertexArray(I)}function d(I,D,X,W){let L=W.wireframe===!0,k=n[D.id];k===void 0&&(k={},n[D.id]=k);let z=I.isInstancedMesh===!0?I.id:0,Z=k[z];Z===void 0&&(Z={},k[z]=Z);let tt=Z[X.id];tt===void 0&&(tt={},Z[X.id]=tt);let rt=tt[L];return rt===void 0&&(rt=u(l()),tt[L]=rt),rt}function u(I){let D=[],X=[],W=[];for(let L=0;L<e;L++)D[L]=0,X[L]=0,W[L]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:D,enabledAttributes:X,attributeDivisors:W,object:I,attributes:{},index:null}}function f(I,D,X,W){let L=r.attributes,k=D.attributes,z=0,Z=X.getAttributes();for(let tt in Z)if(Z[tt].location>=0){let st=L[tt],xt=k[tt];if(xt===void 0&&(tt==="instanceMatrix"&&I.instanceMatrix&&(xt=I.instanceMatrix),tt==="instanceColor"&&I.instanceColor&&(xt=I.instanceColor)),st===void 0||st.attribute!==xt||xt&&st.data!==xt.data)return!0;z++}return r.attributesNum!==z||r.index!==W}function g(I,D,X,W){let L={},k=D.attributes,z=0,Z=X.getAttributes();for(let tt in Z)if(Z[tt].location>=0){let st=k[tt];st===void 0&&(tt==="instanceMatrix"&&I.instanceMatrix&&(st=I.instanceMatrix),tt==="instanceColor"&&I.instanceColor&&(st=I.instanceColor));let xt={};xt.attribute=st,st&&st.data&&(xt.data=st.data),L[tt]=xt,z++}r.attributes=L,r.attributesNum=z,r.index=W}function v(){let I=r.newAttributes;for(let D=0,X=I.length;D<X;D++)I[D]=0}function m(I){p(I,0)}function p(I,D){let X=r.newAttributes,W=r.enabledAttributes,L=r.attributeDivisors;X[I]=1,W[I]===0&&(i.enableVertexAttribArray(I),W[I]=1),L[I]!==D&&(i.vertexAttribDivisor(I,D),L[I]=D)}function E(){let I=r.newAttributes,D=r.enabledAttributes;for(let X=0,W=D.length;X<W;X++)D[X]!==I[X]&&(i.disableVertexAttribArray(X),D[X]=0)}function C(I,D,X,W,L,k,z){z===!0?i.vertexAttribIPointer(I,D,X,L,k):i.vertexAttribPointer(I,D,X,W,L,k)}function S(I,D,X,W){v();let L=W.attributes,k=X.getAttributes(),z=D.defaultAttributeValues;for(let Z in k){let tt=k[Z];if(tt.location>=0){let rt=L[Z];if(rt===void 0&&(Z==="instanceMatrix"&&I.instanceMatrix&&(rt=I.instanceMatrix),Z==="instanceColor"&&I.instanceColor&&(rt=I.instanceColor)),rt!==void 0){let st=rt.normalized,xt=rt.itemSize,Kt=t.get(rt);if(Kt===void 0)continue;let de=Kt.buffer,te=Kt.type,K=Kt.bytesPerElement,at=te===i.INT||te===i.UNSIGNED_INT||rt.gpuType===qr;if(rt.isInterleavedBufferAttribute){let nt=rt.data,Ot=nt.stride,kt=rt.offset;if(nt.isInstancedInterleavedBuffer){for(let Et=0;Et<tt.locationSize;Et++)p(tt.location+Et,nt.meshPerAttribute);I.isInstancedMesh!==!0&&W._maxInstanceCount===void 0&&(W._maxInstanceCount=nt.meshPerAttribute*nt.count)}else for(let Et=0;Et<tt.locationSize;Et++)m(tt.location+Et);i.bindBuffer(i.ARRAY_BUFFER,de);for(let Et=0;Et<tt.locationSize;Et++)C(tt.location+Et,xt/tt.locationSize,te,st,Ot*K,(kt+xt/tt.locationSize*Et)*K,at)}else{if(rt.isInstancedBufferAttribute){for(let nt=0;nt<tt.locationSize;nt++)p(tt.location+nt,rt.meshPerAttribute);I.isInstancedMesh!==!0&&W._maxInstanceCount===void 0&&(W._maxInstanceCount=rt.meshPerAttribute*rt.count)}else for(let nt=0;nt<tt.locationSize;nt++)m(tt.location+nt);i.bindBuffer(i.ARRAY_BUFFER,de);for(let nt=0;nt<tt.locationSize;nt++)C(tt.location+nt,xt/tt.locationSize,te,st,xt*K,xt/tt.locationSize*nt*K,at)}}else if(z!==void 0){let st=z[Z];if(st!==void 0)switch(st.length){case 2:i.vertexAttrib2fv(tt.location,st);break;case 3:i.vertexAttrib3fv(tt.location,st);break;case 4:i.vertexAttrib4fv(tt.location,st);break;default:i.vertexAttrib1fv(tt.location,st)}}}}E()}function y(){w();for(let I in n){let D=n[I];for(let X in D){let W=D[X];for(let L in W){let k=W[L];for(let z in k)h(k[z].object),delete k[z];delete W[L]}}delete n[I]}}function M(I){if(n[I.id]===void 0)return;let D=n[I.id];for(let X in D){let W=D[X];for(let L in W){let k=W[L];for(let z in k)h(k[z].object),delete k[z];delete W[L]}}delete n[I.id]}function T(I){for(let D in n){let X=n[D];for(let W in X){let L=X[W];if(L[I.id]===void 0)continue;let k=L[I.id];for(let z in k)h(k[z].object),delete k[z];delete L[I.id]}}}function x(I){for(let D in n){let X=n[D],W=I.isInstancedMesh===!0?I.id:0,L=X[W];if(L!==void 0){for(let k in L){let z=L[k];for(let Z in z)h(z[Z].object),delete z[Z];delete L[k]}delete X[W],Object.keys(X).length===0&&delete n[D]}}}function w(){R(),o=!0,r!==s&&(r=s,c(r.object))}function R(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:a,reset:w,resetDefaultState:R,dispose:y,releaseStatesOfGeometry:M,releaseStatesOfObject:x,releaseStatesOfProgram:T,initAttributes:v,enableAttribute:m,disableUnusedAttributes:E}}function dp(i,t,e){let n;function s(l){n=l}function r(l,c){i.drawArrays(n,l,c),e.update(c,n,1)}function o(l,c,h){h!==0&&(i.drawArraysInstanced(n,l,c,h),e.update(c,n,h))}function a(l,c,h){if(h===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,c,0,h);let u=0;for(let f=0;f<h;f++)u+=c[f];e.update(u,n,1)}this.setMode=s,this.render=r,this.renderInstances=o,this.renderMultiDraw=a}function fp(i,t,e,n){let s;function r(){if(s!==void 0)return s;if(t.has("EXT_texture_filter_anisotropic")===!0){let T=t.get("EXT_texture_filter_anisotropic");s=i.getParameter(T.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function o(T){return!(T!==Qe&&n.convert(T)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT))}function a(T){let x=T===xn&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(T!==Be&&n.convert(T)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE)&&T!==an&&!x)}function l(T){if(T==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";T="mediump"}return T==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=e.precision!==void 0?e.precision:"highp",h=l(c);h!==c&&(Ft("WebGLRenderer:",c,"not supported, using",h,"instead."),c=h);let d=e.logarithmicDepthBuffer===!0,u=e.reversedDepthBuffer===!0&&t.has("EXT_clip_control");e.reversedDepthBuffer===!0&&u===!1&&Ft("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");let f=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),g=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),v=i.getParameter(i.MAX_TEXTURE_SIZE),m=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),p=i.getParameter(i.MAX_VERTEX_ATTRIBS),E=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),C=i.getParameter(i.MAX_VARYING_VECTORS),S=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),y=i.getParameter(i.MAX_SAMPLES),M=i.getParameter(i.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:l,textureFormatReadable:o,textureTypeReadable:a,precision:c,logarithmicDepthBuffer:d,reversedDepthBuffer:u,maxTextures:f,maxVertexTextures:g,maxTextureSize:v,maxCubemapSize:m,maxAttributes:p,maxVertexUniforms:E,maxVaryings:C,maxFragmentUniforms:S,maxSamples:y,samples:M}}function pp(i){let t=this,e=null,n=0,s=!1,r=!1,o=new Ke,a=new Ht,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(d,u){let f=d.length!==0||u||n!==0||s;return s=u,n=d.length,f},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(d,u){e=h(d,u,0)},this.setState=function(d,u,f){let g=d.clippingPlanes,v=d.clipIntersection,m=d.clipShadows,p=i.get(d);if(!s||g===null||g.length===0||r&&!m)r?h(null):c();else{let E=r?0:n,C=E*4,S=p.clippingState||null;l.value=S,S=h(g,u,C,f);for(let y=0;y!==C;++y)S[y]=e[y];p.clippingState=S,this.numIntersection=v?this.numPlanes:0,this.numPlanes+=E}};function c(){l.value!==e&&(l.value=e,l.needsUpdate=n>0),t.numPlanes=n,t.numIntersection=0}function h(d,u,f,g){let v=d!==null?d.length:0,m=null;if(v!==0){if(m=l.value,g!==!0||m===null){let p=f+v*4,E=u.matrixWorldInverse;a.getNormalMatrix(E),(m===null||m.length<p)&&(m=new Float32Array(p));for(let C=0,S=f;C!==v;++C,S+=4)o.copy(d[C]).applyMatrix4(E,a),o.normal.toArray(m,S),m[S+3]=o.constant}l.value=m,l.needsUpdate=!0}return t.numPlanes=v,t.numIntersection=0,m}}var ti=4,Uc=[.125,.215,.35,.446,.526,.582],fi=20,mp=256,Us=new Xi,Fc=new Gt,ja=null,Qa=0,tl=0,el=!1,gp=new N,No=class{constructor(t){this._renderer=t,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(t,e=0,n=.1,s=100,r={}){let{size:o=256,position:a=gp}=r;ja=this._renderer.getRenderTarget(),Qa=this._renderer.getActiveCubeFace(),tl=this._renderer.getActiveMipmapLevel(),el=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(o);let l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(t,n,s,l,a),e>0&&this._blur(l,0,0,e),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(t,e=null){return this._fromTexture(t,e)}fromCubemap(t,e=null){return this._fromTexture(t,e)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=zc(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Bc(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(t){this._lodMax=Math.floor(Math.log2(t)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let t=0;t<this._lodMeshes.length;t++)this._lodMeshes[t].geometry.dispose()}_cleanup(t){this._renderer.setRenderTarget(ja,Qa,tl),this._renderer.xr.enabled=el,t.scissorTest=!1,Ki(t,0,0,t.width,t.height)}_fromTexture(t,e){t.mapping===Zn||t.mapping===ui?this._setSize(t.image.length===0?16:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4),ja=this._renderer.getRenderTarget(),Qa=this._renderer.getActiveCubeFace(),tl=this._renderer.getActiveMipmapLevel(),el=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=e||this._allocateTargets();return this._textureToCubeUV(t,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let t=3*Math.max(this._cubeSize,112),e=4*this._cubeSize,n={magFilter:we,minFilter:we,generateMipmaps:!1,type:xn,format:Qe,colorSpace:ls,depthBuffer:!1},s=Oc(t,e,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==t||this._pingPongRenderTarget.height!==e){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Oc(t,e,n);let{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=xp(r)),this._blurMaterial=vp(r,t,e),this._ggxMaterial=_p(r,t,e)}return s}_compileMaterial(t){let e=new ue(new qe,t);this._renderer.compile(e,Us)}_sceneToCubeUV(t,e,n,s,r){let l=new Ie(90,1,e,n),c=[1,-1,1,1,1,1],h=[1,1,1,-1,-1,-1],d=this._renderer,u=d.autoClear,f=d.toneMapping;d.getClearColor(Fc),d.toneMapping=rn,d.autoClear=!1,d.state.buffers.depth.getReversed()&&(d.setRenderTarget(s),d.clearDepth(),d.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new ue(new Vi,new Ne({name:"PMREM.Background",side:Te,depthWrite:!1,depthTest:!1})));let v=this._backgroundBox,m=v.material,p=!1,E=t.background;E?E.isColor&&(m.color.copy(E),t.background=null,p=!0):(m.color.copy(Fc),p=!0);for(let C=0;C<6;C++){let S=C%3;S===0?(l.up.set(0,c[C],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x+h[C],r.y,r.z)):S===1?(l.up.set(0,0,c[C]),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y+h[C],r.z)):(l.up.set(0,c[C],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y,r.z+h[C]));let y=this._cubeSize;Ki(s,S*y,C>2?y:0,y,y),d.setRenderTarget(s),p&&d.render(v,l),d.render(t,l)}d.toneMapping=f,d.autoClear=u,t.background=E}_textureToCubeUV(t,e){let n=this._renderer,s=t.mapping===Zn||t.mapping===ui;s?(this._cubemapMaterial===null&&(this._cubemapMaterial=zc()),this._cubemapMaterial.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Bc());let r=s?this._cubemapMaterial:this._equirectMaterial,o=this._lodMeshes[0];o.material=r;let a=r.uniforms;a.envMap.value=t;let l=this._cubeSize;Ki(e,0,0,3*l,2*l),n.setRenderTarget(e),n.render(o,Us)}_applyPMREM(t){let e=this._renderer,n=e.autoClear;e.autoClear=!1;let s=this._lodMeshes.length;for(let r=1;r<s;r++)this._applyGGXFilter(t,r-1,r);e.autoClear=n}_applyGGXFilter(t,e,n){let s=this._renderer,r=this._pingPongRenderTarget,o=this._ggxMaterial,a=this._lodMeshes[n];a.material=o;let l=o.uniforms,c=n/(this._lodMeshes.length-1),h=e/(this._lodMeshes.length-1),d=Math.sqrt(c*c-h*h),u=0+c*1.25,f=d*u,{_lodMax:g}=this,v=this._sizeLods[n],m=3*v*(n>g-ti?n-g+ti:0),p=4*(this._cubeSize-v);l.envMap.value=t.texture,l.roughness.value=f,l.mipInt.value=g-e,Ki(r,m,p,3*v,2*v),s.setRenderTarget(r),s.render(a,Us),l.envMap.value=r.texture,l.roughness.value=0,l.mipInt.value=g-n,Ki(t,m,p,3*v,2*v),s.setRenderTarget(t),s.render(a,Us)}_blur(t,e,n,s,r){let o=this._pingPongRenderTarget;this._halfBlur(t,o,e,n,s,"latitudinal",r),this._halfBlur(o,t,n,n,s,"longitudinal",r)}_halfBlur(t,e,n,s,r,o,a){let l=this._renderer,c=this._blurMaterial;o!=="latitudinal"&&o!=="longitudinal"&&zt("blur direction must be either latitudinal or longitudinal!");let h=3,d=this._lodMeshes[s];d.material=c;let u=c.uniforms,f=this._sizeLods[n]-1,g=isFinite(r)?Math.PI/(2*f):2*Math.PI/(2*fi-1),v=r/g,m=isFinite(r)?1+Math.floor(h*v):fi;m>fi&&Ft(`sigmaRadians, ${r}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${fi}`);let p=[],E=0;for(let T=0;T<fi;++T){let x=T/v,w=Math.exp(-x*x/2);p.push(w),T===0?E+=w:T<m&&(E+=2*w)}for(let T=0;T<p.length;T++)p[T]=p[T]/E;u.envMap.value=t.texture,u.samples.value=m,u.weights.value=p,u.latitudinal.value=o==="latitudinal",a&&(u.poleAxis.value=a);let{_lodMax:C}=this;u.dTheta.value=g,u.mipInt.value=C-n;let S=this._sizeLods[s],y=3*S*(s>C-ti?s-C+ti:0),M=4*(this._cubeSize-S);Ki(e,y,M,3*S,2*S),l.setRenderTarget(e),l.render(d,Us)}};function xp(i){let t=[],e=[],n=[],s=i,r=i-ti+1+Uc.length;for(let o=0;o<r;o++){let a=Math.pow(2,s);t.push(a);let l=1/a;o>i-ti?l=Uc[o-i+ti-1]:o===0&&(l=0),e.push(l);let c=1/(a-2),h=-c,d=1+c,u=[h,h,d,h,d,d,h,h,d,d,h,d],f=6,g=6,v=3,m=2,p=1,E=new Float32Array(v*g*f),C=new Float32Array(m*g*f),S=new Float32Array(p*g*f);for(let M=0;M<f;M++){let T=M%3*2/3-1,x=M>2?0:-1,w=[T,x,0,T+2/3,x,0,T+2/3,x+1,0,T,x,0,T+2/3,x+1,0,T,x+1,0];E.set(w,v*g*M),C.set(u,m*g*M);let R=[M,M,M,M,M,M];S.set(R,p*g*M)}let y=new qe;y.setAttribute("position",new We(E,v)),y.setAttribute("uv",new We(C,m)),y.setAttribute("faceIndex",new We(S,p)),n.push(new ue(y,null)),s>ti&&s--}return{lodMeshes:n,sizeLods:t,sigmas:e}}function Oc(i,t,e){let n=new Xe(i,t,e);return n.texture.mapping=As,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function Ki(i,t,e,n,s){i.viewport.set(t,e,n,s),i.scissor.set(t,e,n,s)}function _p(i,t,e){return new Ye({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:mp,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Oo(),fragmentShader:`

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
		`,blending:gn,depthTest:!1,depthWrite:!1})}function vp(i,t,e){let n=new Float32Array(fi),s=new N(0,1,0);return new Ye({name:"SphericalGaussianBlur",defines:{n:fi,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:s}},vertexShader:Oo(),fragmentShader:`

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
		`,blending:gn,depthTest:!1,depthWrite:!1})}function Bc(){return new Ye({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Oo(),fragmentShader:`

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
		`,blending:gn,depthTest:!1,depthWrite:!1})}function zc(){return new Ye({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Oo(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:gn,depthTest:!1,depthWrite:!1})}function Oo(){return`

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
	`}var Uo=class extends Xe{constructor(t=1,e={}){super(t,t,e),this.isWebGLCubeRenderTarget=!0;let n={width:t,height:t,depth:1},s=[n,n,n,n,n,n];this.texture=new xs(s),this._setTextureOptions(e),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(t,e){this.texture.type=e.type,this.texture.colorSpace=e.colorSpace,this.texture.generateMipmaps=e.generateMipmaps,this.texture.minFilter=e.minFilter,this.texture.magFilter=e.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

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
			`},s=new Vi(5,5,5),r=new Ye({name:"CubemapFromEquirect",uniforms:di(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Te,blending:gn});r.uniforms.tEquirect.value=e;let o=new ue(s,r),a=e.minFilter;return e.minFilter===Jn&&(e.minFilter=we),new Vr(1,10,this).update(t,o),e.minFilter=a,o.geometry.dispose(),o.material.dispose(),this}clear(t,e=!0,n=!0,s=!0){let r=t.getRenderTarget();for(let o=0;o<6;o++)t.setRenderTarget(this,o),t.clear(e,n,s);t.setRenderTarget(r)}};function yp(i){let t=new WeakMap,e=new WeakMap,n=null;function s(u,f=!1){return u==null?null:f?o(u):r(u)}function r(u){if(u&&u.isTexture){let f=u.mapping;if(f===Gr||f===Wr)if(t.has(u)){let g=t.get(u).texture;return a(g,u.mapping)}else{let g=u.image;if(g&&g.height>0){let v=new Uo(g.height);return v.fromEquirectangularTexture(i,u),t.set(u,v),u.addEventListener("dispose",c),a(v.texture,u.mapping)}else return null}}return u}function o(u){if(u&&u.isTexture){let f=u.mapping,g=f===Gr||f===Wr,v=f===Zn||f===ui;if(g||v){let m=e.get(u),p=m!==void 0?m.texture.pmremVersion:0;if(u.isRenderTargetTexture&&u.pmremVersion!==p)return n===null&&(n=new No(i)),m=g?n.fromEquirectangular(u,m):n.fromCubemap(u,m),m.texture.pmremVersion=u.pmremVersion,e.set(u,m),m.texture;if(m!==void 0)return m.texture;{let E=u.image;return g&&E&&E.height>0||v&&E&&l(E)?(n===null&&(n=new No(i)),m=g?n.fromEquirectangular(u):n.fromCubemap(u),m.texture.pmremVersion=u.pmremVersion,e.set(u,m),u.addEventListener("dispose",h),m.texture):null}}}return u}function a(u,f){return f===Gr?u.mapping=Zn:f===Wr&&(u.mapping=ui),u}function l(u){let f=0,g=6;for(let v=0;v<g;v++)u[v]!==void 0&&f++;return f===g}function c(u){let f=u.target;f.removeEventListener("dispose",c);let g=t.get(f);g!==void 0&&(t.delete(f),g.dispose())}function h(u){let f=u.target;f.removeEventListener("dispose",h);let g=e.get(f);g!==void 0&&(e.delete(f),g.dispose())}function d(){t=new WeakMap,e=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:s,dispose:d}}function bp(i){let t={};function e(n){if(t[n]!==void 0)return t[n];let s=i.getExtension(n);return t[n]=s,s}return{has:function(n){return e(n)!==null},init:function(){e("EXT_color_buffer_float"),e("WEBGL_clip_cull_distance"),e("OES_texture_float_linear"),e("EXT_color_buffer_half_float"),e("WEBGL_multisampled_render_to_texture"),e("WEBGL_render_shared_exponent")},get:function(n){let s=e(n);return s===null&&ai("WebGLRenderer: "+n+" extension not supported."),s}}}function Mp(i,t,e,n){let s={},r=new WeakMap;function o(d){let u=d.target;u.index!==null&&t.remove(u.index);for(let g in u.attributes)t.remove(u.attributes[g]);u.removeEventListener("dispose",o),delete s[u.id];let f=r.get(u);f&&(t.remove(f),r.delete(u)),n.releaseStatesOfGeometry(u),u.isInstancedBufferGeometry===!0&&delete u._maxInstanceCount,e.memory.geometries--}function a(d,u){return s[u.id]===!0||(u.addEventListener("dispose",o),s[u.id]=!0,e.memory.geometries++),u}function l(d){let u=d.attributes;for(let f in u)t.update(u[f],i.ARRAY_BUFFER)}function c(d){let u=[],f=d.index,g=d.attributes.position,v=0;if(g===void 0)return;if(f!==null){let E=f.array;v=f.version;for(let C=0,S=E.length;C<S;C+=3){let y=E[C+0],M=E[C+1],T=E[C+2];u.push(y,M,M,T,T,y)}}else{let E=g.array;v=g.version;for(let C=0,S=E.length/3-1;C<S;C+=3){let y=C+0,M=C+1,T=C+2;u.push(y,M,M,T,T,y)}}let m=new(g.count>=65535?ms:ps)(u,1);m.version=v;let p=r.get(d);p&&t.remove(p),r.set(d,m)}function h(d){let u=r.get(d);if(u){let f=d.index;f!==null&&u.version<f.version&&c(d)}else c(d);return r.get(d)}return{get:a,update:l,getWireframeAttribute:h}}function Sp(i,t,e){let n;function s(d){n=d}let r,o;function a(d){r=d.type,o=d.bytesPerElement}function l(d,u){i.drawElements(n,u,r,d*o),e.update(u,n,1)}function c(d,u,f){f!==0&&(i.drawElementsInstanced(n,u,r,d*o,f),e.update(u,n,f))}function h(d,u,f){if(f===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,u,0,r,d,0,f);let v=0;for(let m=0;m<f;m++)v+=u[m];e.update(v,n,1)}this.setMode=s,this.setIndex=a,this.render=l,this.renderInstances=c,this.renderMultiDraw=h}function Ep(i){let t={geometries:0,textures:0},e={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,o,a){switch(e.calls++,o){case i.TRIANGLES:e.triangles+=a*(r/3);break;case i.LINES:e.lines+=a*(r/2);break;case i.LINE_STRIP:e.lines+=a*(r-1);break;case i.LINE_LOOP:e.lines+=a*r;break;case i.POINTS:e.points+=a*r;break;default:zt("WebGLInfo: Unknown draw mode:",o);break}}function s(){e.calls=0,e.triangles=0,e.points=0,e.lines=0}return{memory:t,render:e,programs:null,autoReset:!0,reset:s,update:n}}function wp(i,t,e){let n=new WeakMap,s=new pe;function r(o,a,l){let c=o.morphTargetInfluences,h=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,d=h!==void 0?h.length:0,u=n.get(a);if(u===void 0||u.count!==d){let w=function(){T.dispose(),n.delete(a),a.removeEventListener("dispose",w)};u!==void 0&&u.texture.dispose();let f=a.morphAttributes.position!==void 0,g=a.morphAttributes.normal!==void 0,v=a.morphAttributes.color!==void 0,m=a.morphAttributes.position||[],p=a.morphAttributes.normal||[],E=a.morphAttributes.color||[],C=0;f===!0&&(C=1),g===!0&&(C=2),v===!0&&(C=3);let S=a.attributes.position.count*C,y=1;S>t.maxTextureSize&&(y=Math.ceil(S/t.maxTextureSize),S=t.maxTextureSize);let M=new Float32Array(S*y*4*d),T=new us(M,S,y,d);T.type=an,T.needsUpdate=!0;let x=C*4;for(let R=0;R<d;R++){let I=m[R],D=p[R],X=E[R],W=S*y*4*R;for(let L=0;L<I.count;L++){let k=L*x;f===!0&&(s.fromBufferAttribute(I,L),M[W+k+0]=s.x,M[W+k+1]=s.y,M[W+k+2]=s.z,M[W+k+3]=0),g===!0&&(s.fromBufferAttribute(D,L),M[W+k+4]=s.x,M[W+k+5]=s.y,M[W+k+6]=s.z,M[W+k+7]=0),v===!0&&(s.fromBufferAttribute(X,L),M[W+k+8]=s.x,M[W+k+9]=s.y,M[W+k+10]=s.z,M[W+k+11]=X.itemSize===4?s.w:1)}}u={count:d,texture:T,size:new Yt(S,y)},n.set(a,u),a.addEventListener("dispose",w)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)l.getUniforms().setValue(i,"morphTexture",o.morphTexture,e);else{let f=0;for(let v=0;v<c.length;v++)f+=c[v];let g=a.morphTargetsRelative?1:1-f;l.getUniforms().setValue(i,"morphTargetBaseInfluence",g),l.getUniforms().setValue(i,"morphTargetInfluences",c)}l.getUniforms().setValue(i,"morphTargetsTexture",u.texture,e),l.getUniforms().setValue(i,"morphTargetsTextureSize",u.size)}return{update:r}}function Tp(i,t,e,n,s){let r=new WeakMap;function o(c){let h=s.render.frame,d=c.geometry,u=t.get(c,d);if(r.get(u)!==h&&(t.update(u),r.set(u,h)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),r.get(c)!==h&&(e.update(c.instanceMatrix,i.ARRAY_BUFFER),c.instanceColor!==null&&e.update(c.instanceColor,i.ARRAY_BUFFER),r.set(c,h))),c.isSkinnedMesh){let f=c.skeleton;r.get(f)!==h&&(f.update(),r.set(f,h))}return u}function a(){r=new WeakMap}function l(c){let h=c.target;h.removeEventListener("dispose",l),n.releaseStatesOfObject(h),e.remove(h.instanceMatrix),h.instanceColor!==null&&e.remove(h.instanceColor)}return{update:o,dispose:a}}var Ap={[Ia]:"LINEAR_TONE_MAPPING",[Pa]:"REINHARD_TONE_MAPPING",[La]:"CINEON_TONE_MAPPING",[Da]:"ACES_FILMIC_TONE_MAPPING",[Ua]:"AGX_TONE_MAPPING",[Fa]:"NEUTRAL_TONE_MAPPING",[Na]:"CUSTOM_TONE_MAPPING"};function Cp(i,t,e,n,s,r){let o=new Xe(t,e,{type:i,depthBuffer:s,stencilBuffer:r,samples:n?4:0,depthTexture:s?new Rn(t,e):void 0}),a=new Xe(t,e,{type:xn,depthBuffer:!1,stencilBuffer:!1}),l=new qe;l.setAttribute("position",new ve([-1,3,0,-1,-1,0,3,-1,0],3)),l.setAttribute("uv",new ve([0,2,0,0,2,0],2));let c=new Cr({uniforms:{tDiffuse:{value:null}},vertexShader:`
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
			}`,depthTest:!1,depthWrite:!1}),h=new ue(l,c),d=new Xi(-1,1,1,-1,0,1),u=null,f=null,g=!1,v,m=null,p=[],E=!1;this.setSize=function(C,S){o.setSize(C,S),a.setSize(C,S);for(let y=0;y<p.length;y++){let M=p[y];M.setSize&&M.setSize(C,S)}},this.setEffects=function(C){p=C,E=p.length>0&&p[0].isRenderPass===!0;let S=o.width,y=o.height;for(let M=0;M<p.length;M++){let T=p[M];T.setSize&&T.setSize(S,y)}},this.begin=function(C,S){if(g||C.toneMapping===rn&&p.length===0)return!1;if(m=S,S!==null){let y=S.width,M=S.height;(o.width!==y||o.height!==M)&&this.setSize(y,M)}return E===!1&&C.setRenderTarget(o),v=C.toneMapping,C.toneMapping=rn,!0},this.hasRenderPass=function(){return E},this.end=function(C,S){C.toneMapping=v,g=!0;let y=o,M=a;for(let T=0;T<p.length;T++){let x=p[T];if(x.enabled!==!1&&(x.render(C,M,y,S),x.needsSwap!==!1)){let w=y;y=M,M=w}}if(u!==C.outputColorSpace||f!==C.toneMapping){u=C.outputColorSpace,f=C.toneMapping,c.defines={},jt.getTransfer(u)===ne&&(c.defines.SRGB_TRANSFER="");let T=Ap[f];T&&(c.defines[T]=""),c.needsUpdate=!0}c.uniforms.tDiffuse.value=y.texture,C.setRenderTarget(m),C.render(h,d),m=null,g=!1},this.isCompositing=function(){return g},this.dispose=function(){o.depthTexture&&o.depthTexture.dispose(),o.dispose(),a.dispose(),l.dispose(),c.dispose()}}var rh=new Fe,sl=new Rn(1,1),oh=new us,ah=new wr,lh=new xs,kc=[],Vc=[],Hc=new Float32Array(16),Gc=new Float32Array(9),Wc=new Float32Array(4);function Qi(i,t,e){let n=i[0];if(n<=0||n>0)return i;let s=t*e,r=kc[s];if(r===void 0&&(r=new Float32Array(s),kc[s]=r),t!==0){n.toArray(r,0);for(let o=1,a=0;o!==t;++o)a+=e,i[o].toArray(r,a)}return r}function be(i,t){if(i.length!==t.length)return!1;for(let e=0,n=i.length;e<n;e++)if(i[e]!==t[e])return!1;return!0}function Me(i,t){for(let e=0,n=t.length;e<n;e++)i[e]=t[e]}function Bo(i,t){let e=Vc[t];e===void 0&&(e=new Int32Array(t),Vc[t]=e);for(let n=0;n!==t;++n)e[n]=i.allocateTextureUnit();return e}function Rp(i,t){let e=this.cache;e[0]!==t&&(i.uniform1f(this.addr,t),e[0]=t)}function Ip(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2f(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(be(e,t))return;i.uniform2fv(this.addr,t),Me(e,t)}}function Pp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3f(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else if(t.r!==void 0)(e[0]!==t.r||e[1]!==t.g||e[2]!==t.b)&&(i.uniform3f(this.addr,t.r,t.g,t.b),e[0]=t.r,e[1]=t.g,e[2]=t.b);else{if(be(e,t))return;i.uniform3fv(this.addr,t),Me(e,t)}}function Lp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4f(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(be(e,t))return;i.uniform4fv(this.addr,t),Me(e,t)}}function Dp(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(be(e,t))return;i.uniformMatrix2fv(this.addr,!1,t),Me(e,t)}else{if(be(e,n))return;Wc.set(n),i.uniformMatrix2fv(this.addr,!1,Wc),Me(e,n)}}function Np(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(be(e,t))return;i.uniformMatrix3fv(this.addr,!1,t),Me(e,t)}else{if(be(e,n))return;Gc.set(n),i.uniformMatrix3fv(this.addr,!1,Gc),Me(e,n)}}function Up(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(be(e,t))return;i.uniformMatrix4fv(this.addr,!1,t),Me(e,t)}else{if(be(e,n))return;Hc.set(n),i.uniformMatrix4fv(this.addr,!1,Hc),Me(e,n)}}function Fp(i,t){let e=this.cache;e[0]!==t&&(i.uniform1i(this.addr,t),e[0]=t)}function Op(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2i(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(be(e,t))return;i.uniform2iv(this.addr,t),Me(e,t)}}function Bp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3i(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(be(e,t))return;i.uniform3iv(this.addr,t),Me(e,t)}}function zp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4i(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(be(e,t))return;i.uniform4iv(this.addr,t),Me(e,t)}}function kp(i,t){let e=this.cache;e[0]!==t&&(i.uniform1ui(this.addr,t),e[0]=t)}function Vp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2ui(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(be(e,t))return;i.uniform2uiv(this.addr,t),Me(e,t)}}function Hp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3ui(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(be(e,t))return;i.uniform3uiv(this.addr,t),Me(e,t)}}function Gp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4ui(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(be(e,t))return;i.uniform4uiv(this.addr,t),Me(e,t)}}function Wp(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_2D_SHADOW?(sl.compareFunction=e.isReversedDepthBuffer()?Po:Io,r=sl):r=rh,e.setTexture2D(t||r,s)}function Xp(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture3D(t||ah,s)}function qp(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTextureCube(t||lh,s)}function Yp(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture2DArray(t||oh,s)}function $p(i){switch(i){case 5126:return Rp;case 35664:return Ip;case 35665:return Pp;case 35666:return Lp;case 35674:return Dp;case 35675:return Np;case 35676:return Up;case 5124:case 35670:return Fp;case 35667:case 35671:return Op;case 35668:case 35672:return Bp;case 35669:case 35673:return zp;case 5125:return kp;case 36294:return Vp;case 36295:return Hp;case 36296:return Gp;case 35678:case 36198:case 36298:case 36306:case 35682:return Wp;case 35679:case 36299:case 36307:return Xp;case 35680:case 36300:case 36308:case 36293:return qp;case 36289:case 36303:case 36311:case 36292:return Yp}}function Zp(i,t){i.uniform1fv(this.addr,t)}function Jp(i,t){let e=Qi(t,this.size,2);i.uniform2fv(this.addr,e)}function Kp(i,t){let e=Qi(t,this.size,3);i.uniform3fv(this.addr,e)}function jp(i,t){let e=Qi(t,this.size,4);i.uniform4fv(this.addr,e)}function Qp(i,t){let e=Qi(t,this.size,4);i.uniformMatrix2fv(this.addr,!1,e)}function tm(i,t){let e=Qi(t,this.size,9);i.uniformMatrix3fv(this.addr,!1,e)}function em(i,t){let e=Qi(t,this.size,16);i.uniformMatrix4fv(this.addr,!1,e)}function nm(i,t){i.uniform1iv(this.addr,t)}function im(i,t){i.uniform2iv(this.addr,t)}function sm(i,t){i.uniform3iv(this.addr,t)}function rm(i,t){i.uniform4iv(this.addr,t)}function om(i,t){i.uniform1uiv(this.addr,t)}function am(i,t){i.uniform2uiv(this.addr,t)}function lm(i,t){i.uniform3uiv(this.addr,t)}function cm(i,t){i.uniform4uiv(this.addr,t)}function hm(i,t,e){let n=this.cache,s=t.length,r=Bo(e,s);be(n,r)||(i.uniform1iv(this.addr,r),Me(n,r));let o;this.type===i.SAMPLER_2D_SHADOW?o=sl:o=rh;for(let a=0;a!==s;++a)e.setTexture2D(t[a]||o,r[a])}function um(i,t,e){let n=this.cache,s=t.length,r=Bo(e,s);be(n,r)||(i.uniform1iv(this.addr,r),Me(n,r));for(let o=0;o!==s;++o)e.setTexture3D(t[o]||ah,r[o])}function dm(i,t,e){let n=this.cache,s=t.length,r=Bo(e,s);be(n,r)||(i.uniform1iv(this.addr,r),Me(n,r));for(let o=0;o!==s;++o)e.setTextureCube(t[o]||lh,r[o])}function fm(i,t,e){let n=this.cache,s=t.length,r=Bo(e,s);be(n,r)||(i.uniform1iv(this.addr,r),Me(n,r));for(let o=0;o!==s;++o)e.setTexture2DArray(t[o]||oh,r[o])}function pm(i){switch(i){case 5126:return Zp;case 35664:return Jp;case 35665:return Kp;case 35666:return jp;case 35674:return Qp;case 35675:return tm;case 35676:return em;case 5124:case 35670:return nm;case 35667:case 35671:return im;case 35668:case 35672:return sm;case 35669:case 35673:return rm;case 5125:return om;case 36294:return am;case 36295:return lm;case 36296:return cm;case 35678:case 36198:case 36298:case 36306:case 35682:return hm;case 35679:case 36299:case 36307:return um;case 35680:case 36300:case 36308:case 36293:return dm;case 36289:case 36303:case 36311:case 36292:return fm}}var rl=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.setValue=$p(e.type)}},ol=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.size=e.size,this.setValue=pm(e.type)}},al=class{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,e,n){let s=this.seq;for(let r=0,o=s.length;r!==o;++r){let a=s[r];a.setValue(t,e[a.id],n)}}},nl=/(\w+)(\])?(\[|\.)?/g;function Xc(i,t){i.seq.push(t),i.map[t.id]=t}function mm(i,t,e){let n=i.name,s=n.length;for(nl.lastIndex=0;;){let r=nl.exec(n),o=nl.lastIndex,a=r[1],l=r[2]==="]",c=r[3];if(l&&(a=a|0),c===void 0||c==="["&&o+2===s){Xc(e,c===void 0?new rl(a,i,t):new ol(a,i,t));break}else{let d=e.map[a];d===void 0&&(d=new al(a),Xc(e,d)),e=d}}}var ji=class{constructor(t,e){this.seq=[],this.map={};let n=t.getProgramParameter(e,t.ACTIVE_UNIFORMS);for(let o=0;o<n;++o){let a=t.getActiveUniform(e,o),l=t.getUniformLocation(e,a.name);mm(a,l,this)}let s=[],r=[];for(let o of this.seq)o.type===t.SAMPLER_2D_SHADOW||o.type===t.SAMPLER_CUBE_SHADOW||o.type===t.SAMPLER_2D_ARRAY_SHADOW?s.push(o):r.push(o);s.length>0&&(this.seq=s.concat(r))}setValue(t,e,n,s){let r=this.map[e];r!==void 0&&r.setValue(t,n,s)}setOptional(t,e,n){let s=e[n];s!==void 0&&this.setValue(t,n,s)}static upload(t,e,n,s){for(let r=0,o=e.length;r!==o;++r){let a=e[r],l=n[a.id];l.needsUpdate!==!1&&a.setValue(t,l.value,s)}}static seqWithValue(t,e){let n=[];for(let s=0,r=t.length;s!==r;++s){let o=t[s];o.id in e&&n.push(o)}return n}};function qc(i,t,e){let n=i.createShader(t);return i.shaderSource(n,e),i.compileShader(n),n}var gm=37297,xm=0;function _m(i,t){let e=i.split(`
`),n=[],s=Math.max(t-6,0),r=Math.min(t+6,e.length);for(let o=s;o<r;o++){let a=o+1;n.push(`${a===t?">":" "} ${a}: ${e[o]}`)}return n.join(`
`)}var Yc=new Ht;function vm(i){jt._getMatrix(Yc,jt.workingColorSpace,i);let t=`mat3( ${Yc.elements.map(e=>e.toFixed(4))} )`;switch(jt.getTransfer(i)){case cs:return[t,"LinearTransferOETF"];case ne:return[t,"sRGBTransferOETF"];default:return Ft("WebGLProgram: Unsupported color space: ",i),[t,"LinearTransferOETF"]}}function $c(i,t,e){let n=i.getShaderParameter(t,i.COMPILE_STATUS),r=(i.getShaderInfoLog(t)||"").trim();if(n&&r==="")return"";let o=/ERROR: 0:(\d+)/.exec(r);if(o){let a=parseInt(o[1]);return e.toUpperCase()+`

`+r+`

`+_m(i.getShaderSource(t),a)}else return r}function ym(i,t){let e=vm(t);return[`vec4 ${i}( vec4 value ) {`,`	return ${e[1]}( vec4( value.rgb * ${e[0]}, value.a ) );`,"}"].join(`
`)}var bm={[Ia]:"Linear",[Pa]:"Reinhard",[La]:"Cineon",[Da]:"ACESFilmic",[Ua]:"AgX",[Fa]:"Neutral",[Na]:"Custom"};function Mm(i,t){let e=bm[t];return e===void 0?(Ft("WebGLProgram: Unsupported toneMapping:",t),"vec3 "+i+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+i+"( vec3 color ) { return "+e+"ToneMapping( color ); }"}var Do=new N;function Sm(){jt.getLuminanceCoefficients(Do);let i=Do.x.toFixed(4),t=Do.y.toFixed(4),e=Do.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${i}, ${t}, ${e} );`,"	return dot( weights, rgb );","}"].join(`
`)}function Em(i){return[i.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",i.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Os).join(`
`)}function wm(i){let t=[];for(let e in i){let n=i[e];n!==!1&&t.push("#define "+e+" "+n)}return t.join(`
`)}function Tm(i,t){let e={},n=i.getProgramParameter(t,i.ACTIVE_ATTRIBUTES);for(let s=0;s<n;s++){let r=i.getActiveAttrib(t,s),o=r.name,a=1;r.type===i.FLOAT_MAT2&&(a=2),r.type===i.FLOAT_MAT3&&(a=3),r.type===i.FLOAT_MAT4&&(a=4),e[o]={type:r.type,location:i.getAttribLocation(t,o),locationSize:a}}return e}function Os(i){return i!==""}function Zc(i,t){let e=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return i.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,e).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function Jc(i,t){return i.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var Am=/^[ \t]*#include +<([\w\d./]+)>/gm;function ll(i){return i.replace(Am,Rm)}var Cm=new Map;function Rm(i,t){let e=$t[t];if(e===void 0){let n=Cm.get(t);if(n!==void 0)e=$t[n],Ft('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,n);else throw new Error("THREE.WebGLProgram: Can not resolve #include <"+t+">")}return ll(e)}var Im=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Kc(i){return i.replace(Im,Pm)}function Pm(i,t,e,n){let s="";for(let r=parseInt(t);r<parseInt(e);r++)s+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function jc(i){let t=`precision ${i.precision} float;
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
#define LOW_PRECISION`),t}var Lm={[Ts]:"SHADOWMAP_TYPE_PCF",[Yi]:"SHADOWMAP_TYPE_VSM"};function Dm(i){return Lm[i.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}var Nm={[Zn]:"ENVMAP_TYPE_CUBE",[ui]:"ENVMAP_TYPE_CUBE",[As]:"ENVMAP_TYPE_CUBE_UV"};function Um(i){return i.envMap===!1?"ENVMAP_TYPE_CUBE":Nm[i.envMapMode]||"ENVMAP_TYPE_CUBE"}var Fm={[ui]:"ENVMAP_MODE_REFRACTION"};function Om(i){return i.envMap===!1?"ENVMAP_MODE_REFLECTION":Fm[i.envMapMode]||"ENVMAP_MODE_REFLECTION"}var Bm={[Ra]:"ENVMAP_BLENDING_MULTIPLY",[xc]:"ENVMAP_BLENDING_MIX",[_c]:"ENVMAP_BLENDING_ADD"};function zm(i){return i.envMap===!1?"ENVMAP_BLENDING_NONE":Bm[i.combine]||"ENVMAP_BLENDING_NONE"}function km(i){let t=i.envMapCubeUVHeight;if(t===null)return null;let e=Math.log2(t)-2,n=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,e),112)),texelHeight:n,maxMip:e}}function Vm(i,t,e,n){let s=i.getContext(),r=e.defines,o=e.vertexShader,a=e.fragmentShader,l=Dm(e),c=Um(e),h=Om(e),d=zm(e),u=km(e),f=Em(e),g=wm(r),v=s.createProgram(),m,p,E=e.glslVersion?"#version "+e.glslVersion+`
`:"";e.isRawShaderMaterial?(m=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g].filter(Os).join(`
`),m.length>0&&(m+=`
`),p=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g].filter(Os).join(`
`),p.length>0&&(p+=`
`)):(m=[jc(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g,e.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",e.batching?"#define USE_BATCHING":"",e.batchingColor?"#define USE_BATCHING_COLOR":"",e.instancing?"#define USE_INSTANCING":"",e.instancingColor?"#define USE_INSTANCING_COLOR":"",e.instancingMorph?"#define USE_INSTANCING_MORPH":"",e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+h:"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.displacementMap?"#define USE_DISPLACEMENTMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.mapUv?"#define MAP_UV "+e.mapUv:"",e.alphaMapUv?"#define ALPHAMAP_UV "+e.alphaMapUv:"",e.lightMapUv?"#define LIGHTMAP_UV "+e.lightMapUv:"",e.aoMapUv?"#define AOMAP_UV "+e.aoMapUv:"",e.emissiveMapUv?"#define EMISSIVEMAP_UV "+e.emissiveMapUv:"",e.bumpMapUv?"#define BUMPMAP_UV "+e.bumpMapUv:"",e.normalMapUv?"#define NORMALMAP_UV "+e.normalMapUv:"",e.displacementMapUv?"#define DISPLACEMENTMAP_UV "+e.displacementMapUv:"",e.metalnessMapUv?"#define METALNESSMAP_UV "+e.metalnessMapUv:"",e.roughnessMapUv?"#define ROUGHNESSMAP_UV "+e.roughnessMapUv:"",e.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+e.anisotropyMapUv:"",e.clearcoatMapUv?"#define CLEARCOATMAP_UV "+e.clearcoatMapUv:"",e.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+e.clearcoatNormalMapUv:"",e.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+e.clearcoatRoughnessMapUv:"",e.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+e.iridescenceMapUv:"",e.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+e.iridescenceThicknessMapUv:"",e.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+e.sheenColorMapUv:"",e.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+e.sheenRoughnessMapUv:"",e.specularMapUv?"#define SPECULARMAP_UV "+e.specularMapUv:"",e.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+e.specularColorMapUv:"",e.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+e.specularIntensityMapUv:"",e.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+e.transmissionMapUv:"",e.thicknessMapUv?"#define THICKNESSMAP_UV "+e.thicknessMapUv:"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexNormals?"#define HAS_NORMAL":"",e.vertexColors?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.flatShading?"#define FLAT_SHADED":"",e.skinning?"#define USE_SKINNING":"",e.morphTargets?"#define USE_MORPHTARGETS":"",e.morphNormals&&e.flatShading===!1?"#define USE_MORPHNORMALS":"",e.morphColors?"#define USE_MORPHCOLORS":"",e.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+e.morphTextureStride:"",e.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+e.morphTargetsCount:"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.sizeAttenuation?"#define USE_SIZEATTENUATION":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Os).join(`
`),p=[jc(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g,e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",e.map?"#define USE_MAP":"",e.matcap?"#define USE_MATCAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+c:"",e.envMap?"#define "+h:"",e.envMap?"#define "+d:"",u?"#define CUBEUV_TEXEL_WIDTH "+u.texelWidth:"",u?"#define CUBEUV_TEXEL_HEIGHT "+u.texelHeight:"",u?"#define CUBEUV_MAX_MIP "+u.maxMip+".0":"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoat?"#define USE_CLEARCOAT":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.dispersion?"#define USE_DISPERSION":"",e.iridescence?"#define USE_IRIDESCENCE":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaTest?"#define USE_ALPHATEST":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.sheen?"#define USE_SHEEN":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors||e.instancingColor?"#define USE_COLOR":"",e.vertexAlphas||e.batchingColor?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.gradientMap?"#define USE_GRADIENTMAP":"",e.flatShading?"#define FLAT_SHADED":"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",e.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",e.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",e.toneMapping!==rn?"#define TONE_MAPPING":"",e.toneMapping!==rn?$t.tonemapping_pars_fragment:"",e.toneMapping!==rn?Mm("toneMapping",e.toneMapping):"",e.dithering?"#define DITHERING":"",e.opaque?"#define OPAQUE":"",$t.colorspace_pars_fragment,ym("linearToOutputTexel",e.outputColorSpace),Sm(),e.useDepthPacking?"#define DEPTH_PACKING "+e.depthPacking:"",`
`].filter(Os).join(`
`)),o=ll(o),o=Zc(o,e),o=Jc(o,e),a=ll(a),a=Zc(a,e),a=Jc(a,e),o=Kc(o),a=Kc(a),e.isRawShaderMaterial!==!0&&(E=`#version 300 es
`,m=[f,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,p=["#define varying in",e.glslVersion===Xa?"":"layout(location = 0) out highp vec4 pc_fragColor;",e.glslVersion===Xa?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+p);let C=E+m+o,S=E+p+a,y=qc(s,s.VERTEX_SHADER,C),M=qc(s,s.FRAGMENT_SHADER,S);s.attachShader(v,y),s.attachShader(v,M),e.index0AttributeName!==void 0?s.bindAttribLocation(v,0,e.index0AttributeName):e.hasPositionAttribute===!0&&s.bindAttribLocation(v,0,"position"),s.linkProgram(v);function T(I){if(i.debug.checkShaderErrors){let D=s.getProgramInfoLog(v)||"",X=s.getShaderInfoLog(y)||"",W=s.getShaderInfoLog(M)||"",L=D.trim(),k=X.trim(),z=W.trim(),Z=!0,tt=!0;if(s.getProgramParameter(v,s.LINK_STATUS)===!1)if(Z=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(s,v,y,M);else{let rt=$c(s,y,"vertex"),st=$c(s,M,"fragment");zt("WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(v,s.VALIDATE_STATUS)+`

Material Name: `+I.name+`
Material Type: `+I.type+`

Program Info Log: `+L+`
`+rt+`
`+st)}else L!==""?Ft("WebGLProgram: Program Info Log:",L):(k===""||z==="")&&(tt=!1);tt&&(I.diagnostics={runnable:Z,programLog:L,vertexShader:{log:k,prefix:m},fragmentShader:{log:z,prefix:p}})}s.deleteShader(y),s.deleteShader(M),x=new ji(s,v),w=Tm(s,v)}let x;this.getUniforms=function(){return x===void 0&&T(this),x};let w;this.getAttributes=function(){return w===void 0&&T(this),w};let R=e.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return R===!1&&(R=s.getProgramParameter(v,gm)),R},this.destroy=function(){n.releaseStatesOfProgram(this),s.deleteProgram(v),this.program=void 0},this.type=e.shaderType,this.name=e.shaderName,this.id=xm++,this.cacheKey=t,this.usedTimes=1,this.program=v,this.vertexShader=y,this.fragmentShader=M,this}var Hm=0,cl=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t,e,n){let s=this._getShaderCacheForMaterial(t);return s.has(e)===!1&&(s.add(e),e.usedTimes++),s.has(n)===!1&&(s.add(n),n.usedTimes++),this}remove(t){let e=this.materialCache.get(t);for(let n of e)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(t),this}getVertexShaderStage(t){return this._getShaderStage(t.vertexShader)}getFragmentShaderStage(t){return this._getShaderStage(t.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){let e=this.materialCache,n=e.get(t);return n===void 0&&(n=new Set,e.set(t,n)),n}_getShaderStage(t){let e=this.shaderCache,n=e.get(t);return n===void 0&&(n=new hl(t),e.set(t,n)),n}},hl=class{constructor(t){this.id=Hm++,this.code=t,this.usedTimes=0}};function Gm(i){return i===jn||i===Ds||i===Ns}function Wm(i,t,e,n,s,r){let o=new Oi,a=new cl,l=new Set,c=[],h=new Map,d=n.logarithmicDepthBuffer,u=n.precision,f={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function g(x){return l.add(x),x===0?"uv":`uv${x}`}function v(x,w,R,I,D,X){let W=I.fog,L=D.geometry,k=x.isMeshStandardMaterial||x.isMeshLambertMaterial||x.isMeshPhongMaterial?I.environment:null,z=x.isMeshStandardMaterial||x.isMeshLambertMaterial&&!x.envMap||x.isMeshPhongMaterial&&!x.envMap,Z=t.get(x.envMap||k,z),tt=Z&&Z.mapping===As?Z.image.height:null,rt=f[x.type];x.precision!==null&&(u=n.getMaxPrecision(x.precision),u!==x.precision&&Ft("WebGLProgram.getParameters:",x.precision,"not supported, using",u,"instead."));let st=L.morphAttributes.position||L.morphAttributes.normal||L.morphAttributes.color,xt=st!==void 0?st.length:0,Kt=0;L.morphAttributes.position!==void 0&&(Kt=1),L.morphAttributes.normal!==void 0&&(Kt=2),L.morphAttributes.color!==void 0&&(Kt=3);let de,te,K,at;if(rt){let wt=vn[rt];de=wt.vertexShader,te=wt.fragmentShader}else{de=x.vertexShader,te=x.fragmentShader;let wt=a.getVertexShaderStage(x),me=a.getFragmentShaderStage(x);a.update(x,wt,me),K=wt.id,at=me.id}let nt=i.getRenderTarget(),Ot=i.state.buffers.depth.getReversed(),kt=D.isInstancedMesh===!0,Et=D.isBatchedMesh===!0,ie=!!x.map,Zt=!!x.matcap,O=!!Z,J=!!x.aoMap,ot=!!x.lightMap,bt=!!x.bumpMap&&x.wireframe===!1,At=!!x.normalMap,vt=!!x.displacementMap,Pt=!!x.emissiveMap,St=!!x.metalnessMap,Wt=!!x.roughnessMap,P=x.anisotropy>0,Ut=x.clearcoat>0,Vt=x.dispersion>0,A=x.iridescence>0,_=x.sheen>0,B=x.transmission>0,H=P&&!!x.anisotropyMap,Y=Ut&&!!x.clearcoatMap,it=Ut&&!!x.clearcoatNormalMap,ct=Ut&&!!x.clearcoatRoughnessMap,$=A&&!!x.iridescenceMap,Q=A&&!!x.iridescenceThicknessMap,ht=_&&!!x.sheenColorMap,Rt=_&&!!x.sheenRoughnessMap,ft=!!x.specularMap,ut=!!x.specularColorMap,Nt=!!x.specularIntensityMap,Bt=B&&!!x.transmissionMap,Xt=B&&!!x.thicknessMap,U=!!x.gradientMap,lt=!!x.alphaMap,j=x.alphaTest>0,dt=!!x.alphaHash,_t=!!x.extensions,et=rn;x.toneMapped&&(nt===null||nt.isXRRenderTarget===!0)&&(et=i.toneMapping);let Ct={shaderID:rt,shaderType:x.type,shaderName:x.name,vertexShader:de,fragmentShader:te,defines:x.defines,customVertexShaderID:K,customFragmentShaderID:at,isRawShaderMaterial:x.isRawShaderMaterial===!0,glslVersion:x.glslVersion,precision:u,batching:Et,batchingColor:Et&&D._colorsTexture!==null,instancing:kt,instancingColor:kt&&D.instanceColor!==null,instancingMorph:kt&&D.morphTexture!==null,outputColorSpace:nt===null?i.outputColorSpace:nt.isXRRenderTarget===!0?nt.texture.colorSpace:jt.workingColorSpace,alphaToCoverage:!!x.alphaToCoverage,map:ie,matcap:Zt,envMap:O,envMapMode:O&&Z.mapping,envMapCubeUVHeight:tt,aoMap:J,lightMap:ot,bumpMap:bt,normalMap:At,displacementMap:vt,emissiveMap:Pt,normalMapObjectSpace:At&&x.normalMapType===bc,normalMapTangentSpace:At&&x.normalMapType===Ro,packedNormalMap:At&&x.normalMapType===Ro&&Gm(x.normalMap.format),metalnessMap:St,roughnessMap:Wt,anisotropy:P,anisotropyMap:H,clearcoat:Ut,clearcoatMap:Y,clearcoatNormalMap:it,clearcoatRoughnessMap:ct,dispersion:Vt,iridescence:A,iridescenceMap:$,iridescenceThicknessMap:Q,sheen:_,sheenColorMap:ht,sheenRoughnessMap:Rt,specularMap:ft,specularColorMap:ut,specularIntensityMap:Nt,transmission:B,transmissionMap:Bt,thicknessMap:Xt,gradientMap:U,opaque:x.transparent===!1&&x.blending===li&&x.alphaToCoverage===!1,alphaMap:lt,alphaTest:j,alphaHash:dt,combine:x.combine,mapUv:ie&&g(x.map.channel),aoMapUv:J&&g(x.aoMap.channel),lightMapUv:ot&&g(x.lightMap.channel),bumpMapUv:bt&&g(x.bumpMap.channel),normalMapUv:At&&g(x.normalMap.channel),displacementMapUv:vt&&g(x.displacementMap.channel),emissiveMapUv:Pt&&g(x.emissiveMap.channel),metalnessMapUv:St&&g(x.metalnessMap.channel),roughnessMapUv:Wt&&g(x.roughnessMap.channel),anisotropyMapUv:H&&g(x.anisotropyMap.channel),clearcoatMapUv:Y&&g(x.clearcoatMap.channel),clearcoatNormalMapUv:it&&g(x.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:ct&&g(x.clearcoatRoughnessMap.channel),iridescenceMapUv:$&&g(x.iridescenceMap.channel),iridescenceThicknessMapUv:Q&&g(x.iridescenceThicknessMap.channel),sheenColorMapUv:ht&&g(x.sheenColorMap.channel),sheenRoughnessMapUv:Rt&&g(x.sheenRoughnessMap.channel),specularMapUv:ft&&g(x.specularMap.channel),specularColorMapUv:ut&&g(x.specularColorMap.channel),specularIntensityMapUv:Nt&&g(x.specularIntensityMap.channel),transmissionMapUv:Bt&&g(x.transmissionMap.channel),thicknessMapUv:Xt&&g(x.thicknessMap.channel),alphaMapUv:lt&&g(x.alphaMap.channel),vertexTangents:!!L.attributes.tangent&&(At||P),vertexNormals:!!L.attributes.normal,vertexColors:x.vertexColors,vertexAlphas:x.vertexColors===!0&&!!L.attributes.color&&L.attributes.color.itemSize===4,pointsUvs:D.isPoints===!0&&!!L.attributes.uv&&(ie||lt),fog:!!W,useFog:x.fog===!0,fogExp2:!!W&&W.isFogExp2,flatShading:x.wireframe===!1&&(x.flatShading===!0||L.attributes.normal===void 0&&At===!1&&(x.isMeshLambertMaterial||x.isMeshPhongMaterial||x.isMeshStandardMaterial||x.isMeshPhysicalMaterial)),sizeAttenuation:x.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:Ot,skinning:D.isSkinnedMesh===!0,hasPositionAttribute:L.attributes.position!==void 0,morphTargets:L.morphAttributes.position!==void 0,morphNormals:L.morphAttributes.normal!==void 0,morphColors:L.morphAttributes.color!==void 0,morphTargetsCount:xt,morphTextureStride:Kt,numDirLights:w.directional.length,numPointLights:w.point.length,numSpotLights:w.spot.length,numSpotLightMaps:w.spotLightMap.length,numRectAreaLights:w.rectArea.length,numHemiLights:w.hemi.length,numDirLightShadows:w.directionalShadowMap.length,numPointLightShadows:w.pointShadowMap.length,numSpotLightShadows:w.spotShadowMap.length,numSpotLightShadowsWithMaps:w.numSpotLightShadowsWithMaps,numLightProbes:w.numLightProbes,numLightProbeGrids:X.length,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:x.dithering,shadowMapEnabled:i.shadowMap.enabled&&R.length>0,shadowMapType:i.shadowMap.type,toneMapping:et,decodeVideoTexture:ie&&x.map.isVideoTexture===!0&&jt.getTransfer(x.map.colorSpace)===ne,decodeVideoTextureEmissive:Pt&&x.emissiveMap.isVideoTexture===!0&&jt.getTransfer(x.emissiveMap.colorSpace)===ne,premultipliedAlpha:x.premultipliedAlpha,doubleSided:x.side===Oe,flipSided:x.side===Te,useDepthPacking:x.depthPacking>=0,depthPacking:x.depthPacking||0,index0AttributeName:x.index0AttributeName,extensionClipCullDistance:_t&&x.extensions.clipCullDistance===!0&&e.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(_t&&x.extensions.multiDraw===!0||Et)&&e.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:e.has("KHR_parallel_shader_compile"),customProgramCacheKey:x.customProgramCacheKey()};return Ct.vertexUv1s=l.has(1),Ct.vertexUv2s=l.has(2),Ct.vertexUv3s=l.has(3),l.clear(),Ct}function m(x){let w=[];if(x.shaderID?w.push(x.shaderID):(w.push(x.customVertexShaderID),w.push(x.customFragmentShaderID)),x.defines!==void 0)for(let R in x.defines)w.push(R),w.push(x.defines[R]);return x.isRawShaderMaterial===!1&&(p(w,x),E(w,x),w.push(i.outputColorSpace)),w.push(x.customProgramCacheKey),w.join()}function p(x,w){x.push(w.precision),x.push(w.outputColorSpace),x.push(w.envMapMode),x.push(w.envMapCubeUVHeight),x.push(w.mapUv),x.push(w.alphaMapUv),x.push(w.lightMapUv),x.push(w.aoMapUv),x.push(w.bumpMapUv),x.push(w.normalMapUv),x.push(w.displacementMapUv),x.push(w.emissiveMapUv),x.push(w.metalnessMapUv),x.push(w.roughnessMapUv),x.push(w.anisotropyMapUv),x.push(w.clearcoatMapUv),x.push(w.clearcoatNormalMapUv),x.push(w.clearcoatRoughnessMapUv),x.push(w.iridescenceMapUv),x.push(w.iridescenceThicknessMapUv),x.push(w.sheenColorMapUv),x.push(w.sheenRoughnessMapUv),x.push(w.specularMapUv),x.push(w.specularColorMapUv),x.push(w.specularIntensityMapUv),x.push(w.transmissionMapUv),x.push(w.thicknessMapUv),x.push(w.combine),x.push(w.fogExp2),x.push(w.sizeAttenuation),x.push(w.morphTargetsCount),x.push(w.morphAttributeCount),x.push(w.numDirLights),x.push(w.numPointLights),x.push(w.numSpotLights),x.push(w.numSpotLightMaps),x.push(w.numHemiLights),x.push(w.numRectAreaLights),x.push(w.numDirLightShadows),x.push(w.numPointLightShadows),x.push(w.numSpotLightShadows),x.push(w.numSpotLightShadowsWithMaps),x.push(w.numLightProbes),x.push(w.shadowMapType),x.push(w.toneMapping),x.push(w.numClippingPlanes),x.push(w.numClipIntersection),x.push(w.depthPacking)}function E(x,w){o.disableAll(),w.instancing&&o.enable(0),w.instancingColor&&o.enable(1),w.instancingMorph&&o.enable(2),w.matcap&&o.enable(3),w.envMap&&o.enable(4),w.normalMapObjectSpace&&o.enable(5),w.normalMapTangentSpace&&o.enable(6),w.clearcoat&&o.enable(7),w.iridescence&&o.enable(8),w.alphaTest&&o.enable(9),w.vertexColors&&o.enable(10),w.vertexAlphas&&o.enable(11),w.vertexUv1s&&o.enable(12),w.vertexUv2s&&o.enable(13),w.vertexUv3s&&o.enable(14),w.vertexTangents&&o.enable(15),w.anisotropy&&o.enable(16),w.alphaHash&&o.enable(17),w.batching&&o.enable(18),w.dispersion&&o.enable(19),w.batchingColor&&o.enable(20),w.gradientMap&&o.enable(21),w.packedNormalMap&&o.enable(22),w.vertexNormals&&o.enable(23),x.push(o.mask),o.disableAll(),w.fog&&o.enable(0),w.useFog&&o.enable(1),w.flatShading&&o.enable(2),w.logarithmicDepthBuffer&&o.enable(3),w.reversedDepthBuffer&&o.enable(4),w.skinning&&o.enable(5),w.morphTargets&&o.enable(6),w.morphNormals&&o.enable(7),w.morphColors&&o.enable(8),w.premultipliedAlpha&&o.enable(9),w.shadowMapEnabled&&o.enable(10),w.doubleSided&&o.enable(11),w.flipSided&&o.enable(12),w.useDepthPacking&&o.enable(13),w.dithering&&o.enable(14),w.transmission&&o.enable(15),w.sheen&&o.enable(16),w.opaque&&o.enable(17),w.pointsUvs&&o.enable(18),w.decodeVideoTexture&&o.enable(19),w.decodeVideoTextureEmissive&&o.enable(20),w.alphaToCoverage&&o.enable(21),w.numLightProbeGrids>0&&o.enable(22),w.hasPositionAttribute&&o.enable(23),x.push(o.mask)}function C(x){let w=f[x.type],R;if(w){let I=vn[w];R=Dc.clone(I.uniforms)}else R=x.uniforms;return R}function S(x,w){let R=h.get(w);return R!==void 0?++R.usedTimes:(R=new Vm(i,w,x,s),c.push(R),h.set(w,R)),R}function y(x){if(--x.usedTimes===0){let w=c.indexOf(x);c[w]=c[c.length-1],c.pop(),h.delete(x.cacheKey),x.destroy()}}function M(x){a.remove(x)}function T(){a.dispose()}return{getParameters:v,getProgramCacheKey:m,getUniforms:C,acquireProgram:S,releaseProgram:y,releaseShaderCache:M,programs:c,dispose:T}}function Xm(){let i=new WeakMap;function t(o){return i.has(o)}function e(o){let a=i.get(o);return a===void 0&&(a={},i.set(o,a)),a}function n(o){i.delete(o)}function s(o,a,l){i.get(o)[a]=l}function r(){i=new WeakMap}return{has:t,get:e,remove:n,update:s,dispose:r}}function qm(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.material.id!==t.material.id?i.material.id-t.material.id:i.materialVariant!==t.materialVariant?i.materialVariant-t.materialVariant:i.z!==t.z?i.z-t.z:i.id-t.id}function Qc(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.z!==t.z?t.z-i.z:i.id-t.id}function th(){let i=[],t=0,e=[],n=[],s=[];function r(){t=0,e.length=0,n.length=0,s.length=0}function o(u){let f=0;return u.isInstancedMesh&&(f+=2),u.isSkinnedMesh&&(f+=1),f}function a(u,f,g,v,m,p){let E=i[t];return E===void 0?(E={id:u.id,object:u,geometry:f,material:g,materialVariant:o(u),groupOrder:v,renderOrder:u.renderOrder,z:m,group:p},i[t]=E):(E.id=u.id,E.object=u,E.geometry=f,E.material=g,E.materialVariant=o(u),E.groupOrder=v,E.renderOrder=u.renderOrder,E.z=m,E.group=p),t++,E}function l(u,f,g,v,m,p){let E=a(u,f,g,v,m,p);g.transmission>0?n.push(E):g.transparent===!0?s.push(E):e.push(E)}function c(u,f,g,v,m,p){let E=a(u,f,g,v,m,p);g.transmission>0?n.unshift(E):g.transparent===!0?s.unshift(E):e.unshift(E)}function h(u,f,g){e.length>1&&e.sort(u||qm),n.length>1&&n.sort(f||Qc),s.length>1&&s.sort(f||Qc),g&&(e.reverse(),n.reverse(),s.reverse())}function d(){for(let u=t,f=i.length;u<f;u++){let g=i[u];if(g.id===null)break;g.id=null,g.object=null,g.geometry=null,g.material=null,g.group=null}}return{opaque:e,transmissive:n,transparent:s,init:r,push:l,unshift:c,finish:d,sort:h}}function Ym(){let i=new WeakMap;function t(n,s){let r=i.get(n),o;return r===void 0?(o=new th,i.set(n,[o])):s>=r.length?(o=new th,r.push(o)):o=r[s],o}function e(){i=new WeakMap}return{get:t,dispose:e}}function $m(){let i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"DirectionalLight":e={direction:new N,color:new Gt};break;case"SpotLight":e={position:new N,direction:new N,color:new Gt,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":e={position:new N,color:new Gt,distance:0,decay:0};break;case"HemisphereLight":e={direction:new N,skyColor:new Gt,groundColor:new Gt};break;case"RectAreaLight":e={color:new Gt,position:new N,halfWidth:new N,halfHeight:new N};break}return i[t.id]=e,e}}}function Zm(){let i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"DirectionalLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Yt};break;case"SpotLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Yt};break;case"PointLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Yt,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[t.id]=e,e}}}var Jm=0;function Km(i,t){return(t.castShadow?2:0)-(i.castShadow?2:0)+(t.map?1:0)-(i.map?1:0)}function jm(i){let t=new $m,e=Zm(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new N);let s=new N,r=new fe,o=new fe;function a(c){let h=0,d=0,u=0;for(let w=0;w<9;w++)n.probe[w].set(0,0,0);let f=0,g=0,v=0,m=0,p=0,E=0,C=0,S=0,y=0,M=0,T=0;c.sort(Km);for(let w=0,R=c.length;w<R;w++){let I=c[w],D=I.color,X=I.intensity,W=I.distance,L=null;if(I.shadow&&I.shadow.map&&(I.shadow.map.texture.format===jn?L=I.shadow.map.texture:L=I.shadow.map.depthTexture||I.shadow.map.texture),I.isAmbientLight)h+=D.r*X,d+=D.g*X,u+=D.b*X;else if(I.isLightProbe){for(let k=0;k<9;k++)n.probe[k].addScaledVector(I.sh.coefficients[k],X);T++}else if(I.isDirectionalLight){let k=t.get(I);if(k.color.copy(I.color).multiplyScalar(I.intensity),I.castShadow){let z=I.shadow,Z=e.get(I);Z.shadowIntensity=z.intensity,Z.shadowBias=z.bias,Z.shadowNormalBias=z.normalBias,Z.shadowRadius=z.radius,Z.shadowMapSize=z.mapSize,n.directionalShadow[f]=Z,n.directionalShadowMap[f]=L,n.directionalShadowMatrix[f]=I.shadow.matrix,E++}n.directional[f]=k,f++}else if(I.isSpotLight){let k=t.get(I);k.position.setFromMatrixPosition(I.matrixWorld),k.color.copy(D).multiplyScalar(X),k.distance=W,k.coneCos=Math.cos(I.angle),k.penumbraCos=Math.cos(I.angle*(1-I.penumbra)),k.decay=I.decay,n.spot[v]=k;let z=I.shadow;if(I.map&&(n.spotLightMap[y]=I.map,y++,z.updateMatrices(I),I.castShadow&&M++),n.spotLightMatrix[v]=z.matrix,I.castShadow){let Z=e.get(I);Z.shadowIntensity=z.intensity,Z.shadowBias=z.bias,Z.shadowNormalBias=z.normalBias,Z.shadowRadius=z.radius,Z.shadowMapSize=z.mapSize,n.spotShadow[v]=Z,n.spotShadowMap[v]=L,S++}v++}else if(I.isRectAreaLight){let k=t.get(I);k.color.copy(D).multiplyScalar(X),k.halfWidth.set(I.width*.5,0,0),k.halfHeight.set(0,I.height*.5,0),n.rectArea[m]=k,m++}else if(I.isPointLight){let k=t.get(I);if(k.color.copy(I.color).multiplyScalar(I.intensity),k.distance=I.distance,k.decay=I.decay,I.castShadow){let z=I.shadow,Z=e.get(I);Z.shadowIntensity=z.intensity,Z.shadowBias=z.bias,Z.shadowNormalBias=z.normalBias,Z.shadowRadius=z.radius,Z.shadowMapSize=z.mapSize,Z.shadowCameraNear=z.camera.near,Z.shadowCameraFar=z.camera.far,n.pointShadow[g]=Z,n.pointShadowMap[g]=L,n.pointShadowMatrix[g]=I.shadow.matrix,C++}n.point[g]=k,g++}else if(I.isHemisphereLight){let k=t.get(I);k.skyColor.copy(I.color).multiplyScalar(X),k.groundColor.copy(I.groundColor).multiplyScalar(X),n.hemi[p]=k,p++}}m>0&&(i.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=pt.LTC_FLOAT_1,n.rectAreaLTC2=pt.LTC_FLOAT_2):(n.rectAreaLTC1=pt.LTC_HALF_1,n.rectAreaLTC2=pt.LTC_HALF_2)),n.ambient[0]=h,n.ambient[1]=d,n.ambient[2]=u;let x=n.hash;(x.directionalLength!==f||x.pointLength!==g||x.spotLength!==v||x.rectAreaLength!==m||x.hemiLength!==p||x.numDirectionalShadows!==E||x.numPointShadows!==C||x.numSpotShadows!==S||x.numSpotMaps!==y||x.numLightProbes!==T)&&(n.directional.length=f,n.spot.length=v,n.rectArea.length=m,n.point.length=g,n.hemi.length=p,n.directionalShadow.length=E,n.directionalShadowMap.length=E,n.pointShadow.length=C,n.pointShadowMap.length=C,n.spotShadow.length=S,n.spotShadowMap.length=S,n.directionalShadowMatrix.length=E,n.pointShadowMatrix.length=C,n.spotLightMatrix.length=S+y-M,n.spotLightMap.length=y,n.numSpotLightShadowsWithMaps=M,n.numLightProbes=T,x.directionalLength=f,x.pointLength=g,x.spotLength=v,x.rectAreaLength=m,x.hemiLength=p,x.numDirectionalShadows=E,x.numPointShadows=C,x.numSpotShadows=S,x.numSpotMaps=y,x.numLightProbes=T,n.version=Jm++)}function l(c,h){let d=0,u=0,f=0,g=0,v=0,m=h.matrixWorldInverse;for(let p=0,E=c.length;p<E;p++){let C=c[p];if(C.isDirectionalLight){let S=n.directional[d];S.direction.setFromMatrixPosition(C.matrixWorld),s.setFromMatrixPosition(C.target.matrixWorld),S.direction.sub(s),S.direction.transformDirection(m),d++}else if(C.isSpotLight){let S=n.spot[f];S.position.setFromMatrixPosition(C.matrixWorld),S.position.applyMatrix4(m),S.direction.setFromMatrixPosition(C.matrixWorld),s.setFromMatrixPosition(C.target.matrixWorld),S.direction.sub(s),S.direction.transformDirection(m),f++}else if(C.isRectAreaLight){let S=n.rectArea[g];S.position.setFromMatrixPosition(C.matrixWorld),S.position.applyMatrix4(m),o.identity(),r.copy(C.matrixWorld),r.premultiply(m),o.extractRotation(r),S.halfWidth.set(C.width*.5,0,0),S.halfHeight.set(0,C.height*.5,0),S.halfWidth.applyMatrix4(o),S.halfHeight.applyMatrix4(o),g++}else if(C.isPointLight){let S=n.point[u];S.position.setFromMatrixPosition(C.matrixWorld),S.position.applyMatrix4(m),u++}else if(C.isHemisphereLight){let S=n.hemi[v];S.direction.setFromMatrixPosition(C.matrixWorld),S.direction.transformDirection(m),v++}}}return{setup:a,setupView:l,state:n}}function eh(i){let t=new jm(i),e=[],n=[],s=[];function r(u){d.camera=u,e.length=0,n.length=0,s.length=0}function o(u){e.push(u)}function a(u){n.push(u)}function l(u){s.push(u)}function c(){t.setup(e)}function h(u){t.setupView(e,u)}let d={lightsArray:e,shadowsArray:n,lightProbeGridArray:s,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:r,state:d,setupLights:c,setupLightsView:h,pushLight:o,pushShadow:a,pushLightProbeGrid:l}}function Qm(i){let t=new WeakMap;function e(s,r=0){let o=t.get(s),a;return o===void 0?(a=new eh(i),t.set(s,[a])):r>=o.length?(a=new eh(i),o.push(a)):a=o[r],a}function n(){t=new WeakMap}return{get:e,dispose:n}}var tg=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,eg=`uniform sampler2D shadow_pass;
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
}`,ng=[new N(1,0,0),new N(-1,0,0),new N(0,1,0),new N(0,-1,0),new N(0,0,1),new N(0,0,-1)],ig=[new N(0,-1,0),new N(0,-1,0),new N(0,0,1),new N(0,0,-1),new N(0,-1,0),new N(0,-1,0)],nh=new fe,Fs=new N,il=new N;function sg(i,t,e){let n=new ki,s=new Yt,r=new Yt,o=new pe,a=new Rr,l=new Ir,c={},h=e.maxTextureSize,d={[An]:Te,[Te]:An,[Oe]:Oe},u=new Ye({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Yt},radius:{value:4}},vertexShader:tg,fragmentShader:eg}),f=u.clone();f.defines.HORIZONTAL_PASS=1;let g=new qe;g.setAttribute("position",new We(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let v=new ue(g,u),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Ts;let p=this.type;this.render=function(M,T,x){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||M.length===0)return;this.type===jl&&(Ft("WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead."),this.type=Ts);let w=i.getRenderTarget(),R=i.getActiveCubeFace(),I=i.getActiveMipmapLevel(),D=i.state;D.setBlending(gn),D.buffers.depth.getReversed()===!0?D.buffers.color.setClear(0,0,0,0):D.buffers.color.setClear(1,1,1,1),D.buffers.depth.setTest(!0),D.setScissorTest(!1);let X=p!==this.type;X&&T.traverse(function(W){W.material&&(Array.isArray(W.material)?W.material.forEach(L=>L.needsUpdate=!0):W.material.needsUpdate=!0)});for(let W=0,L=M.length;W<L;W++){let k=M[W],z=k.shadow;if(z===void 0){Ft("WebGLShadowMap:",k,"has no shadow.");continue}if(z.autoUpdate===!1&&z.needsUpdate===!1)continue;s.copy(z.mapSize);let Z=z.getFrameExtents();s.multiply(Z),r.copy(z.mapSize),(s.x>h||s.y>h)&&(s.x>h&&(r.x=Math.floor(h/Z.x),s.x=r.x*Z.x,z.mapSize.x=r.x),s.y>h&&(r.y=Math.floor(h/Z.y),s.y=r.y*Z.y,z.mapSize.y=r.y));let tt=i.state.buffers.depth.getReversed();if(z.camera._reversedDepth=tt,z.map===null||X===!0){if(z.map!==null&&(z.map.depthTexture!==null&&(z.map.depthTexture.dispose(),z.map.depthTexture=null),z.map.dispose()),this.type===Yi){if(k.isPointLight){Ft("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}z.map=new Xe(s.x,s.y,{format:jn,type:xn,minFilter:we,magFilter:we,generateMipmaps:!1}),z.map.texture.name=k.name+".shadowMap",z.map.depthTexture=new Rn(s.x,s.y,an),z.map.depthTexture.name=k.name+".shadowMapDepth",z.map.depthTexture.format=pn,z.map.depthTexture.compareFunction=null,z.map.depthTexture.minFilter=Ee,z.map.depthTexture.magFilter=Ee}else k.isPointLight?(z.map=new Uo(s.x),z.map.depthTexture=new Ar(s.x,on)):(z.map=new Xe(s.x,s.y),z.map.depthTexture=new Rn(s.x,s.y,on)),z.map.depthTexture.name=k.name+".shadowMap",z.map.depthTexture.format=pn,this.type===Ts?(z.map.depthTexture.compareFunction=tt?Po:Io,z.map.depthTexture.minFilter=we,z.map.depthTexture.magFilter=we):(z.map.depthTexture.compareFunction=null,z.map.depthTexture.minFilter=Ee,z.map.depthTexture.magFilter=Ee);z.camera.updateProjectionMatrix()}let rt=z.map.isWebGLCubeRenderTarget?6:1;for(let st=0;st<rt;st++){if(z.map.isWebGLCubeRenderTarget)i.setRenderTarget(z.map,st),i.clear();else{st===0&&(i.setRenderTarget(z.map),i.clear());let xt=z.getViewport(st);o.set(r.x*xt.x,r.y*xt.y,r.x*xt.z,r.y*xt.w),D.viewport(o)}if(k.isPointLight){let xt=z.camera,Kt=z.matrix,de=k.distance||xt.far;de!==xt.far&&(xt.far=de,xt.updateProjectionMatrix()),Fs.setFromMatrixPosition(k.matrixWorld),xt.position.copy(Fs),il.copy(xt.position),il.add(ng[st]),xt.up.copy(ig[st]),xt.lookAt(il),xt.updateMatrixWorld(),Kt.makeTranslation(-Fs.x,-Fs.y,-Fs.z),nh.multiplyMatrices(xt.projectionMatrix,xt.matrixWorldInverse),z._frustum.setFromProjectionMatrix(nh,xt.coordinateSystem,xt.reversedDepth)}else z.updateMatrices(k);n=z.getFrustum(),S(T,x,z.camera,k,this.type)}z.isPointLightShadow!==!0&&this.type===Yi&&E(z,x),z.needsUpdate=!1}p=this.type,m.needsUpdate=!1,i.setRenderTarget(w,R,I)};function E(M,T){let x=t.update(v);u.defines.VSM_SAMPLES!==M.blurSamples&&(u.defines.VSM_SAMPLES=M.blurSamples,f.defines.VSM_SAMPLES=M.blurSamples,u.needsUpdate=!0,f.needsUpdate=!0),M.mapPass===null&&(M.mapPass=new Xe(s.x,s.y,{format:jn,type:xn})),u.uniforms.shadow_pass.value=M.map.depthTexture,u.uniforms.resolution.value=M.mapSize,u.uniforms.radius.value=M.radius,i.setRenderTarget(M.mapPass),i.clear(),i.renderBufferDirect(T,null,x,u,v,null),f.uniforms.shadow_pass.value=M.mapPass.texture,f.uniforms.resolution.value=M.mapSize,f.uniforms.radius.value=M.radius,i.setRenderTarget(M.map),i.clear(),i.renderBufferDirect(T,null,x,f,v,null)}function C(M,T,x,w){let R=null,I=x.isPointLight===!0?M.customDistanceMaterial:M.customDepthMaterial;if(I!==void 0)R=I;else if(R=x.isPointLight===!0?l:a,i.localClippingEnabled&&T.clipShadows===!0&&Array.isArray(T.clippingPlanes)&&T.clippingPlanes.length!==0||T.displacementMap&&T.displacementScale!==0||T.alphaMap&&T.alphaTest>0||T.map&&T.alphaTest>0||T.alphaToCoverage===!0){let D=R.uuid,X=T.uuid,W=c[D];W===void 0&&(W={},c[D]=W);let L=W[X];L===void 0&&(L=R.clone(),W[X]=L,T.addEventListener("dispose",y)),R=L}if(R.visible=T.visible,R.wireframe=T.wireframe,w===Yi?R.side=T.shadowSide!==null?T.shadowSide:T.side:R.side=T.shadowSide!==null?T.shadowSide:d[T.side],R.alphaMap=T.alphaMap,R.alphaTest=T.alphaToCoverage===!0?.5:T.alphaTest,R.map=T.map,R.clipShadows=T.clipShadows,R.clippingPlanes=T.clippingPlanes,R.clipIntersection=T.clipIntersection,R.displacementMap=T.displacementMap,R.displacementScale=T.displacementScale,R.displacementBias=T.displacementBias,R.wireframeLinewidth=T.wireframeLinewidth,R.linewidth=T.linewidth,x.isPointLight===!0&&R.isMeshDistanceMaterial===!0){let D=i.properties.get(R);D.light=x}return R}function S(M,T,x,w,R){if(M.visible===!1)return;if(M.layers.test(T.layers)&&(M.isMesh||M.isLine||M.isPoints)&&(M.castShadow||M.receiveShadow&&R===Yi)&&(!M.frustumCulled||n.intersectsObject(M))){M.modelViewMatrix.multiplyMatrices(x.matrixWorldInverse,M.matrixWorld);let X=t.update(M),W=M.material;if(Array.isArray(W)){let L=X.groups;for(let k=0,z=L.length;k<z;k++){let Z=L[k],tt=W[Z.materialIndex];if(tt&&tt.visible){let rt=C(M,tt,w,R);M.onBeforeShadow(i,M,T,x,X,rt,Z),i.renderBufferDirect(x,null,X,rt,M,Z),M.onAfterShadow(i,M,T,x,X,rt,Z)}}}else if(W.visible){let L=C(M,W,w,R);M.onBeforeShadow(i,M,T,x,X,L,null),i.renderBufferDirect(x,null,X,L,M,null),M.onAfterShadow(i,M,T,x,X,L,null)}}let D=M.children;for(let X=0,W=D.length;X<W;X++)S(D[X],T,x,w,R)}function y(M){M.target.removeEventListener("dispose",y);for(let x in c){let w=c[x],R=M.target.uuid;R in w&&(w[R].dispose(),delete w[R])}}}function rg(i,t){function e(){let U=!1,lt=new pe,j=null,dt=new pe(0,0,0,0);return{setMask:function(_t){j!==_t&&!U&&(i.colorMask(_t,_t,_t,_t),j=_t)},setLocked:function(_t){U=_t},setClear:function(_t,et,Ct,wt,me){me===!0&&(_t*=wt,et*=wt,Ct*=wt),lt.set(_t,et,Ct,wt),dt.equals(lt)===!1&&(i.clearColor(_t,et,Ct,wt),dt.copy(lt))},reset:function(){U=!1,j=null,dt.set(-1,0,0,0)}}}function n(){let U=!1,lt=!1,j=null,dt=null,_t=null;return{setReversed:function(et){if(lt!==et){let Ct=t.get("EXT_clip_control");et?Ct.clipControlEXT(Ct.LOWER_LEFT_EXT,Ct.ZERO_TO_ONE_EXT):Ct.clipControlEXT(Ct.LOWER_LEFT_EXT,Ct.NEGATIVE_ONE_TO_ONE_EXT),lt=et;let wt=_t;_t=null,this.setClear(wt)}},getReversed:function(){return lt},setTest:function(et){et?nt(i.DEPTH_TEST):Ot(i.DEPTH_TEST)},setMask:function(et){j!==et&&!U&&(i.depthMask(et),j=et)},setFunc:function(et){if(lt&&(et=Pc[et]),dt!==et){switch(et){case fr:i.depthFunc(i.NEVER);break;case pr:i.depthFunc(i.ALWAYS);break;case mr:i.depthFunc(i.LESS);break;case ci:i.depthFunc(i.LEQUAL);break;case gr:i.depthFunc(i.EQUAL);break;case xr:i.depthFunc(i.GEQUAL);break;case _r:i.depthFunc(i.GREATER);break;case vr:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}dt=et}},setLocked:function(et){U=et},setClear:function(et){_t!==et&&(_t=et,lt&&(et=1-et),i.clearDepth(et))},reset:function(){U=!1,j=null,dt=null,_t=null,lt=!1}}}function s(){let U=!1,lt=null,j=null,dt=null,_t=null,et=null,Ct=null,wt=null,me=null;return{setTest:function(le){U||(le?nt(i.STENCIL_TEST):Ot(i.STENCIL_TEST))},setMask:function(le){lt!==le&&!U&&(i.stencilMask(le),lt=le)},setFunc:function(le,cn,hn){(j!==le||dt!==cn||_t!==hn)&&(i.stencilFunc(le,cn,hn),j=le,dt=cn,_t=hn)},setOp:function(le,cn,hn){(et!==le||Ct!==cn||wt!==hn)&&(i.stencilOp(le,cn,hn),et=le,Ct=cn,wt=hn)},setLocked:function(le){U=le},setClear:function(le){me!==le&&(i.clearStencil(le),me=le)},reset:function(){U=!1,lt=null,j=null,dt=null,_t=null,et=null,Ct=null,wt=null,me=null}}}let r=new e,o=new n,a=new s,l=new WeakMap,c=new WeakMap,h={},d={},u={},f=new WeakMap,g=[],v=null,m=!1,p=null,E=null,C=null,S=null,y=null,M=null,T=null,x=new Gt(0,0,0),w=0,R=!1,I=null,D=null,X=null,W=null,L=null,k=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS),z=!1,Z=0,tt=i.getParameter(i.VERSION);tt.indexOf("WebGL")!==-1?(Z=parseFloat(/^WebGL (\d)/.exec(tt)[1]),z=Z>=1):tt.indexOf("OpenGL ES")!==-1&&(Z=parseFloat(/^OpenGL ES (\d)/.exec(tt)[1]),z=Z>=2);let rt=null,st={},xt=i.getParameter(i.SCISSOR_BOX),Kt=i.getParameter(i.VIEWPORT),de=new pe().fromArray(xt),te=new pe().fromArray(Kt);function K(U,lt,j,dt){let _t=new Uint8Array(4),et=i.createTexture();i.bindTexture(U,et),i.texParameteri(U,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(U,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let Ct=0;Ct<j;Ct++)U===i.TEXTURE_3D||U===i.TEXTURE_2D_ARRAY?i.texImage3D(lt,0,i.RGBA,1,1,dt,0,i.RGBA,i.UNSIGNED_BYTE,_t):i.texImage2D(lt+Ct,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,_t);return et}let at={};at[i.TEXTURE_2D]=K(i.TEXTURE_2D,i.TEXTURE_2D,1),at[i.TEXTURE_CUBE_MAP]=K(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),at[i.TEXTURE_2D_ARRAY]=K(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),at[i.TEXTURE_3D]=K(i.TEXTURE_3D,i.TEXTURE_3D,1,1),r.setClear(0,0,0,1),o.setClear(1),a.setClear(0),nt(i.DEPTH_TEST),o.setFunc(ci),bt(!1),At(wa),nt(i.CULL_FACE),J(gn);function nt(U){h[U]!==!0&&(i.enable(U),h[U]=!0)}function Ot(U){h[U]!==!1&&(i.disable(U),h[U]=!1)}function kt(U,lt){return u[U]!==lt?(i.bindFramebuffer(U,lt),u[U]=lt,U===i.DRAW_FRAMEBUFFER&&(u[i.FRAMEBUFFER]=lt),U===i.FRAMEBUFFER&&(u[i.DRAW_FRAMEBUFFER]=lt),!0):!1}function Et(U,lt){let j=g,dt=!1;if(U){j=f.get(lt),j===void 0&&(j=[],f.set(lt,j));let _t=U.textures;if(j.length!==_t.length||j[0]!==i.COLOR_ATTACHMENT0){for(let et=0,Ct=_t.length;et<Ct;et++)j[et]=i.COLOR_ATTACHMENT0+et;j.length=_t.length,dt=!0}}else j[0]!==i.BACK&&(j[0]=i.BACK,dt=!0);dt&&i.drawBuffers(j)}function ie(U){return v!==U?(i.useProgram(U),v=U,!0):!1}let Zt={[Gn]:i.FUNC_ADD,[tc]:i.FUNC_SUBTRACT,[ec]:i.FUNC_REVERSE_SUBTRACT};Zt[nc]=i.MIN,Zt[ic]=i.MAX;let O={[sc]:i.ZERO,[rc]:i.ONE,[oc]:i.SRC_COLOR,[ur]:i.SRC_ALPHA,[dc]:i.SRC_ALPHA_SATURATE,[hc]:i.DST_COLOR,[lc]:i.DST_ALPHA,[ac]:i.ONE_MINUS_SRC_COLOR,[dr]:i.ONE_MINUS_SRC_ALPHA,[uc]:i.ONE_MINUS_DST_COLOR,[cc]:i.ONE_MINUS_DST_ALPHA,[fc]:i.CONSTANT_COLOR,[pc]:i.ONE_MINUS_CONSTANT_COLOR,[mc]:i.CONSTANT_ALPHA,[gc]:i.ONE_MINUS_CONSTANT_ALPHA};function J(U,lt,j,dt,_t,et,Ct,wt,me,le){if(U===gn){m===!0&&(Ot(i.BLEND),m=!1);return}if(m===!1&&(nt(i.BLEND),m=!0),U!==Ql){if(U!==p||le!==R){if((E!==Gn||y!==Gn)&&(i.blendEquation(i.FUNC_ADD),E=Gn,y=Gn),le)switch(U){case li:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Ta:i.blendFunc(i.ONE,i.ONE);break;case Aa:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case Ca:i.blendFuncSeparate(i.DST_COLOR,i.ONE_MINUS_SRC_ALPHA,i.ZERO,i.ONE);break;default:zt("WebGLState: Invalid blending: ",U);break}else switch(U){case li:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Ta:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE,i.ONE,i.ONE);break;case Aa:zt("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Ca:zt("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:zt("WebGLState: Invalid blending: ",U);break}C=null,S=null,M=null,T=null,x.set(0,0,0),w=0,p=U,R=le}return}_t=_t||lt,et=et||j,Ct=Ct||dt,(lt!==E||_t!==y)&&(i.blendEquationSeparate(Zt[lt],Zt[_t]),E=lt,y=_t),(j!==C||dt!==S||et!==M||Ct!==T)&&(i.blendFuncSeparate(O[j],O[dt],O[et],O[Ct]),C=j,S=dt,M=et,T=Ct),(wt.equals(x)===!1||me!==w)&&(i.blendColor(wt.r,wt.g,wt.b,me),x.copy(wt),w=me),p=U,R=!1}function ot(U,lt){U.side===Oe?Ot(i.CULL_FACE):nt(i.CULL_FACE);let j=U.side===Te;lt&&(j=!j),bt(j),U.blending===li&&U.transparent===!1?J(gn):J(U.blending,U.blendEquation,U.blendSrc,U.blendDst,U.blendEquationAlpha,U.blendSrcAlpha,U.blendDstAlpha,U.blendColor,U.blendAlpha,U.premultipliedAlpha),o.setFunc(U.depthFunc),o.setTest(U.depthTest),o.setMask(U.depthWrite),r.setMask(U.colorWrite);let dt=U.stencilWrite;a.setTest(dt),dt&&(a.setMask(U.stencilWriteMask),a.setFunc(U.stencilFunc,U.stencilRef,U.stencilFuncMask),a.setOp(U.stencilFail,U.stencilZFail,U.stencilZPass)),Pt(U.polygonOffset,U.polygonOffsetFactor,U.polygonOffsetUnits),U.alphaToCoverage===!0?nt(i.SAMPLE_ALPHA_TO_COVERAGE):Ot(i.SAMPLE_ALPHA_TO_COVERAGE)}function bt(U){I!==U&&(U?i.frontFace(i.CW):i.frontFace(i.CCW),I=U)}function At(U){U!==Jl?(nt(i.CULL_FACE),U!==D&&(U===wa?i.cullFace(i.BACK):U===Kl?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):Ot(i.CULL_FACE),D=U}function vt(U){U!==X&&(z&&i.lineWidth(U),X=U)}function Pt(U,lt,j){U?(nt(i.POLYGON_OFFSET_FILL),(W!==lt||L!==j)&&(W=lt,L=j,o.getReversed()&&(lt=-lt),i.polygonOffset(lt,j))):Ot(i.POLYGON_OFFSET_FILL)}function St(U){U?nt(i.SCISSOR_TEST):Ot(i.SCISSOR_TEST)}function Wt(U){U===void 0&&(U=i.TEXTURE0+k-1),rt!==U&&(i.activeTexture(U),rt=U)}function P(U,lt,j){j===void 0&&(rt===null?j=i.TEXTURE0+k-1:j=rt);let dt=st[j];dt===void 0&&(dt={type:void 0,texture:void 0},st[j]=dt),(dt.type!==U||dt.texture!==lt)&&(rt!==j&&(i.activeTexture(j),rt=j),i.bindTexture(U,lt||at[U]),dt.type=U,dt.texture=lt)}function Ut(){let U=st[rt];U!==void 0&&U.type!==void 0&&(i.bindTexture(U.type,null),U.type=void 0,U.texture=void 0)}function Vt(){try{i.compressedTexImage2D(...arguments)}catch(U){zt("WebGLState:",U)}}function A(){try{i.compressedTexImage3D(...arguments)}catch(U){zt("WebGLState:",U)}}function _(){try{i.texSubImage2D(...arguments)}catch(U){zt("WebGLState:",U)}}function B(){try{i.texSubImage3D(...arguments)}catch(U){zt("WebGLState:",U)}}function H(){try{i.compressedTexSubImage2D(...arguments)}catch(U){zt("WebGLState:",U)}}function Y(){try{i.compressedTexSubImage3D(...arguments)}catch(U){zt("WebGLState:",U)}}function it(){try{i.texStorage2D(...arguments)}catch(U){zt("WebGLState:",U)}}function ct(){try{i.texStorage3D(...arguments)}catch(U){zt("WebGLState:",U)}}function $(){try{i.texImage2D(...arguments)}catch(U){zt("WebGLState:",U)}}function Q(){try{i.texImage3D(...arguments)}catch(U){zt("WebGLState:",U)}}function ht(U){return d[U]!==void 0?d[U]:i.getParameter(U)}function Rt(U,lt){d[U]!==lt&&(i.pixelStorei(U,lt),d[U]=lt)}function ft(U){de.equals(U)===!1&&(i.scissor(U.x,U.y,U.z,U.w),de.copy(U))}function ut(U){te.equals(U)===!1&&(i.viewport(U.x,U.y,U.z,U.w),te.copy(U))}function Nt(U,lt){let j=c.get(lt);j===void 0&&(j=new WeakMap,c.set(lt,j));let dt=j.get(U);dt===void 0&&(dt=i.getUniformBlockIndex(lt,U.name),j.set(U,dt))}function Bt(U,lt){let dt=c.get(lt).get(U);l.get(lt)!==dt&&(i.uniformBlockBinding(lt,dt,U.__bindingPointIndex),l.set(lt,dt))}function Xt(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.blendColor(0,0,0,0),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),o.setReversed(!1),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),i.pixelStorei(i.PACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,!1),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,i.BROWSER_DEFAULT_WEBGL),i.pixelStorei(i.PACK_ROW_LENGTH,0),i.pixelStorei(i.PACK_SKIP_PIXELS,0),i.pixelStorei(i.PACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_IMAGE_HEIGHT,0),i.pixelStorei(i.UNPACK_SKIP_PIXELS,0),i.pixelStorei(i.UNPACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_SKIP_IMAGES,0),h={},d={},rt=null,st={},u={},f=new WeakMap,g=[],v=null,m=!1,p=null,E=null,C=null,S=null,y=null,M=null,T=null,x=new Gt(0,0,0),w=0,R=!1,I=null,D=null,X=null,W=null,L=null,de.set(0,0,i.canvas.width,i.canvas.height),te.set(0,0,i.canvas.width,i.canvas.height),r.reset(),o.reset(),a.reset()}return{buffers:{color:r,depth:o,stencil:a},enable:nt,disable:Ot,bindFramebuffer:kt,drawBuffers:Et,useProgram:ie,setBlending:J,setMaterial:ot,setFlipSided:bt,setCullFace:At,setLineWidth:vt,setPolygonOffset:Pt,setScissorTest:St,activeTexture:Wt,bindTexture:P,unbindTexture:Ut,compressedTexImage2D:Vt,compressedTexImage3D:A,texImage2D:$,texImage3D:Q,pixelStorei:Rt,getParameter:ht,updateUBOMapping:Nt,uniformBlockBinding:Bt,texStorage2D:it,texStorage3D:ct,texSubImage2D:_,texSubImage3D:B,compressedTexSubImage2D:H,compressedTexSubImage3D:Y,scissor:ft,viewport:ut,reset:Xt}}function og(i,t,e,n,s,r,o){let a=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new Yt,h=new WeakMap,d=new Set,u,f=new WeakMap,g=!1;try{g=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function v(A,_){return g?new OffscreenCanvas(A,_):hs("canvas")}function m(A,_,B){let H=1,Y=Vt(A);if((Y.width>B||Y.height>B)&&(H=B/Math.max(Y.width,Y.height)),H<1)if(typeof HTMLImageElement<"u"&&A instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&A instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&A instanceof ImageBitmap||typeof VideoFrame<"u"&&A instanceof VideoFrame){let it=Math.floor(H*Y.width),ct=Math.floor(H*Y.height);u===void 0&&(u=v(it,ct));let $=_?v(it,ct):u;return $.width=it,$.height=ct,$.getContext("2d").drawImage(A,0,0,it,ct),Ft("WebGLRenderer: Texture has been resized from ("+Y.width+"x"+Y.height+") to ("+it+"x"+ct+")."),$}else return"data"in A&&Ft("WebGLRenderer: Image in DataTexture is too big ("+Y.width+"x"+Y.height+")."),A;return A}function p(A){return A.generateMipmaps}function E(A){i.generateMipmap(A)}function C(A){return A.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:A.isWebGL3DRenderTarget?i.TEXTURE_3D:A.isWebGLArrayRenderTarget||A.isCompressedArrayTexture?i.TEXTURE_2D_ARRAY:i.TEXTURE_2D}function S(A,_,B,H,Y,it=!1){if(A!==null){if(i[A]!==void 0)return i[A];Ft("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+A+"'")}let ct;H&&(ct=t.get("EXT_texture_norm16"),ct||Ft("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let $=_;if(_===i.RED&&(B===i.FLOAT&&($=i.R32F),B===i.HALF_FLOAT&&($=i.R16F),B===i.UNSIGNED_BYTE&&($=i.R8),B===i.UNSIGNED_SHORT&&ct&&($=ct.R16_EXT),B===i.SHORT&&ct&&($=ct.R16_SNORM_EXT)),_===i.RED_INTEGER&&(B===i.UNSIGNED_BYTE&&($=i.R8UI),B===i.UNSIGNED_SHORT&&($=i.R16UI),B===i.UNSIGNED_INT&&($=i.R32UI),B===i.BYTE&&($=i.R8I),B===i.SHORT&&($=i.R16I),B===i.INT&&($=i.R32I)),_===i.RG&&(B===i.FLOAT&&($=i.RG32F),B===i.HALF_FLOAT&&($=i.RG16F),B===i.UNSIGNED_BYTE&&($=i.RG8),B===i.UNSIGNED_SHORT&&ct&&($=ct.RG16_EXT),B===i.SHORT&&ct&&($=ct.RG16_SNORM_EXT)),_===i.RG_INTEGER&&(B===i.UNSIGNED_BYTE&&($=i.RG8UI),B===i.UNSIGNED_SHORT&&($=i.RG16UI),B===i.UNSIGNED_INT&&($=i.RG32UI),B===i.BYTE&&($=i.RG8I),B===i.SHORT&&($=i.RG16I),B===i.INT&&($=i.RG32I)),_===i.RGB_INTEGER&&(B===i.UNSIGNED_BYTE&&($=i.RGB8UI),B===i.UNSIGNED_SHORT&&($=i.RGB16UI),B===i.UNSIGNED_INT&&($=i.RGB32UI),B===i.BYTE&&($=i.RGB8I),B===i.SHORT&&($=i.RGB16I),B===i.INT&&($=i.RGB32I)),_===i.RGBA_INTEGER&&(B===i.UNSIGNED_BYTE&&($=i.RGBA8UI),B===i.UNSIGNED_SHORT&&($=i.RGBA16UI),B===i.UNSIGNED_INT&&($=i.RGBA32UI),B===i.BYTE&&($=i.RGBA8I),B===i.SHORT&&($=i.RGBA16I),B===i.INT&&($=i.RGBA32I)),_===i.RGB&&(B===i.UNSIGNED_SHORT&&ct&&($=ct.RGB16_EXT),B===i.SHORT&&ct&&($=ct.RGB16_SNORM_EXT),B===i.UNSIGNED_INT_5_9_9_9_REV&&($=i.RGB9_E5),B===i.UNSIGNED_INT_10F_11F_11F_REV&&($=i.R11F_G11F_B10F)),_===i.RGBA){let Q=it?cs:jt.getTransfer(Y);B===i.FLOAT&&($=i.RGBA32F),B===i.HALF_FLOAT&&($=i.RGBA16F),B===i.UNSIGNED_BYTE&&($=Q===ne?i.SRGB8_ALPHA8:i.RGBA8),B===i.UNSIGNED_SHORT&&ct&&($=ct.RGBA16_EXT),B===i.SHORT&&ct&&($=ct.RGBA16_SNORM_EXT),B===i.UNSIGNED_SHORT_4_4_4_4&&($=i.RGBA4),B===i.UNSIGNED_SHORT_5_5_5_1&&($=i.RGB5_A1)}return($===i.R16F||$===i.R32F||$===i.RG16F||$===i.RG32F||$===i.RGBA16F||$===i.RGBA32F)&&t.get("EXT_color_buffer_float"),$}function y(A,_){let B;return A?_===null||_===on||_===Zi?B=i.DEPTH24_STENCIL8:_===an?B=i.DEPTH32F_STENCIL8:_===$i&&(B=i.DEPTH24_STENCIL8,Ft("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):_===null||_===on||_===Zi?B=i.DEPTH_COMPONENT24:_===an?B=i.DEPTH_COMPONENT32F:_===$i&&(B=i.DEPTH_COMPONENT16),B}function M(A,_){return p(A)===!0||A.isFramebufferTexture&&A.minFilter!==Ee&&A.minFilter!==we?Math.log2(Math.max(_.width,_.height))+1:A.mipmaps!==void 0&&A.mipmaps.length>0?A.mipmaps.length:A.isCompressedTexture&&Array.isArray(A.image)?_.mipmaps.length:1}function T(A){let _=A.target;_.removeEventListener("dispose",T),w(_),_.isVideoTexture&&h.delete(_),_.isHTMLTexture&&d.delete(_)}function x(A){let _=A.target;_.removeEventListener("dispose",x),I(_)}function w(A){let _=n.get(A);if(_.__webglInit===void 0)return;let B=A.source,H=f.get(B);if(H){let Y=H[_.__cacheKey];Y.usedTimes--,Y.usedTimes===0&&R(A),Object.keys(H).length===0&&f.delete(B)}n.remove(A)}function R(A){let _=n.get(A);i.deleteTexture(_.__webglTexture);let B=A.source,H=f.get(B);delete H[_.__cacheKey],o.memory.textures--}function I(A){let _=n.get(A);if(A.depthTexture&&(A.depthTexture.dispose(),n.remove(A.depthTexture)),A.isWebGLCubeRenderTarget)for(let H=0;H<6;H++){if(Array.isArray(_.__webglFramebuffer[H]))for(let Y=0;Y<_.__webglFramebuffer[H].length;Y++)i.deleteFramebuffer(_.__webglFramebuffer[H][Y]);else i.deleteFramebuffer(_.__webglFramebuffer[H]);_.__webglDepthbuffer&&i.deleteRenderbuffer(_.__webglDepthbuffer[H])}else{if(Array.isArray(_.__webglFramebuffer))for(let H=0;H<_.__webglFramebuffer.length;H++)i.deleteFramebuffer(_.__webglFramebuffer[H]);else i.deleteFramebuffer(_.__webglFramebuffer);if(_.__webglDepthbuffer&&i.deleteRenderbuffer(_.__webglDepthbuffer),_.__webglMultisampledFramebuffer&&i.deleteFramebuffer(_.__webglMultisampledFramebuffer),_.__webglColorRenderbuffer)for(let H=0;H<_.__webglColorRenderbuffer.length;H++)_.__webglColorRenderbuffer[H]&&i.deleteRenderbuffer(_.__webglColorRenderbuffer[H]);_.__webglDepthRenderbuffer&&i.deleteRenderbuffer(_.__webglDepthRenderbuffer)}let B=A.textures;for(let H=0,Y=B.length;H<Y;H++){let it=n.get(B[H]);it.__webglTexture&&(i.deleteTexture(it.__webglTexture),o.memory.textures--),n.remove(B[H])}n.remove(A)}let D=0;function X(){D=0}function W(){return D}function L(A){D=A}function k(){let A=D;return A>=s.maxTextures&&Ft("WebGLTextures: Trying to use "+A+" texture units while this GPU supports only "+s.maxTextures),D+=1,A}function z(A){let _=[];return _.push(A.wrapS),_.push(A.wrapT),_.push(A.wrapR||0),_.push(A.magFilter),_.push(A.minFilter),_.push(A.anisotropy),_.push(A.internalFormat),_.push(A.format),_.push(A.type),_.push(A.generateMipmaps),_.push(A.premultiplyAlpha),_.push(A.flipY),_.push(A.unpackAlignment),_.push(A.colorSpace),_.join()}function Z(A,_){let B=n.get(A);if(A.isVideoTexture&&P(A),A.isRenderTargetTexture===!1&&A.isExternalTexture!==!0&&A.version>0&&B.__version!==A.version){let H=A.image;if(H===null)Ft("WebGLRenderer: Texture marked for update but no image data found.");else if(H.complete===!1)Ft("WebGLRenderer: Texture marked for update but image is incomplete");else{Ot(B,A,_);return}}else A.isExternalTexture&&(B.__webglTexture=A.sourceTexture?A.sourceTexture:null);e.bindTexture(i.TEXTURE_2D,B.__webglTexture,i.TEXTURE0+_)}function tt(A,_){let B=n.get(A);if(A.isRenderTargetTexture===!1&&A.version>0&&B.__version!==A.version){Ot(B,A,_);return}else A.isExternalTexture&&(B.__webglTexture=A.sourceTexture?A.sourceTexture:null);e.bindTexture(i.TEXTURE_2D_ARRAY,B.__webglTexture,i.TEXTURE0+_)}function rt(A,_){let B=n.get(A);if(A.isRenderTargetTexture===!1&&A.version>0&&B.__version!==A.version){Ot(B,A,_);return}e.bindTexture(i.TEXTURE_3D,B.__webglTexture,i.TEXTURE0+_)}function st(A,_){let B=n.get(A);if(A.isCubeDepthTexture!==!0&&A.version>0&&B.__version!==A.version){kt(B,A,_);return}e.bindTexture(i.TEXTURE_CUBE_MAP,B.__webglTexture,i.TEXTURE0+_)}let xt={[yr]:i.REPEAT,[fn]:i.CLAMP_TO_EDGE,[br]:i.MIRRORED_REPEAT},Kt={[Ee]:i.NEAREST,[vc]:i.NEAREST_MIPMAP_NEAREST,[Cs]:i.NEAREST_MIPMAP_LINEAR,[we]:i.LINEAR,[Xr]:i.LINEAR_MIPMAP_NEAREST,[Jn]:i.LINEAR_MIPMAP_LINEAR},de={[Mc]:i.NEVER,[Ac]:i.ALWAYS,[Sc]:i.LESS,[Io]:i.LEQUAL,[Ec]:i.EQUAL,[Po]:i.GEQUAL,[wc]:i.GREATER,[Tc]:i.NOTEQUAL};function te(A,_){if(_.type===an&&t.has("OES_texture_float_linear")===!1&&(_.magFilter===we||_.magFilter===Xr||_.magFilter===Cs||_.magFilter===Jn||_.minFilter===we||_.minFilter===Xr||_.minFilter===Cs||_.minFilter===Jn)&&Ft("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),i.texParameteri(A,i.TEXTURE_WRAP_S,xt[_.wrapS]),i.texParameteri(A,i.TEXTURE_WRAP_T,xt[_.wrapT]),(A===i.TEXTURE_3D||A===i.TEXTURE_2D_ARRAY)&&i.texParameteri(A,i.TEXTURE_WRAP_R,xt[_.wrapR]),i.texParameteri(A,i.TEXTURE_MAG_FILTER,Kt[_.magFilter]),i.texParameteri(A,i.TEXTURE_MIN_FILTER,Kt[_.minFilter]),_.compareFunction&&(i.texParameteri(A,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(A,i.TEXTURE_COMPARE_FUNC,de[_.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(_.magFilter===Ee||_.minFilter!==Cs&&_.minFilter!==Jn||_.type===an&&t.has("OES_texture_float_linear")===!1)return;if(_.anisotropy>1||n.get(_).__currentAnisotropy){let B=t.get("EXT_texture_filter_anisotropic");i.texParameterf(A,B.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(_.anisotropy,s.getMaxAnisotropy())),n.get(_).__currentAnisotropy=_.anisotropy}}}function K(A,_){let B=!1;A.__webglInit===void 0&&(A.__webglInit=!0,_.addEventListener("dispose",T));let H=_.source,Y=f.get(H);Y===void 0&&(Y={},f.set(H,Y));let it=z(_);if(it!==A.__cacheKey){Y[it]===void 0&&(Y[it]={texture:i.createTexture(),usedTimes:0},o.memory.textures++,B=!0),Y[it].usedTimes++;let ct=Y[A.__cacheKey];ct!==void 0&&(Y[A.__cacheKey].usedTimes--,ct.usedTimes===0&&R(_)),A.__cacheKey=it,A.__webglTexture=Y[it].texture}return B}function at(A,_,B){return Math.floor(Math.floor(A/B)/_)}function nt(A,_,B,H){let it=A.updateRanges;if(it.length===0)e.texSubImage2D(i.TEXTURE_2D,0,0,0,_.width,_.height,B,H,_.data);else{it.sort((Rt,ft)=>Rt.start-ft.start);let ct=0;for(let Rt=1;Rt<it.length;Rt++){let ft=it[ct],ut=it[Rt],Nt=ft.start+ft.count,Bt=at(ut.start,_.width,4),Xt=at(ft.start,_.width,4);ut.start<=Nt+1&&Bt===Xt&&at(ut.start+ut.count-1,_.width,4)===Bt?ft.count=Math.max(ft.count,ut.start+ut.count-ft.start):(++ct,it[ct]=ut)}it.length=ct+1;let $=e.getParameter(i.UNPACK_ROW_LENGTH),Q=e.getParameter(i.UNPACK_SKIP_PIXELS),ht=e.getParameter(i.UNPACK_SKIP_ROWS);e.pixelStorei(i.UNPACK_ROW_LENGTH,_.width);for(let Rt=0,ft=it.length;Rt<ft;Rt++){let ut=it[Rt],Nt=Math.floor(ut.start/4),Bt=Math.ceil(ut.count/4),Xt=Nt%_.width,U=Math.floor(Nt/_.width),lt=Bt,j=1;e.pixelStorei(i.UNPACK_SKIP_PIXELS,Xt),e.pixelStorei(i.UNPACK_SKIP_ROWS,U),e.texSubImage2D(i.TEXTURE_2D,0,Xt,U,lt,j,B,H,_.data)}A.clearUpdateRanges(),e.pixelStorei(i.UNPACK_ROW_LENGTH,$),e.pixelStorei(i.UNPACK_SKIP_PIXELS,Q),e.pixelStorei(i.UNPACK_SKIP_ROWS,ht)}}function Ot(A,_,B){let H=i.TEXTURE_2D;(_.isDataArrayTexture||_.isCompressedArrayTexture)&&(H=i.TEXTURE_2D_ARRAY),_.isData3DTexture&&(H=i.TEXTURE_3D);let Y=K(A,_),it=_.source;e.bindTexture(H,A.__webglTexture,i.TEXTURE0+B);let ct=n.get(it);if(it.version!==ct.__version||Y===!0){if(e.activeTexture(i.TEXTURE0+B),(typeof ImageBitmap<"u"&&_.image instanceof ImageBitmap)===!1){let j=jt.getPrimaries(jt.workingColorSpace),dt=_.colorSpace===In?null:jt.getPrimaries(_.colorSpace),_t=_.colorSpace===In||j===dt?i.NONE:i.BROWSER_DEFAULT_WEBGL;e.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,_.flipY),e.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,_.premultiplyAlpha),e.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,_t)}e.pixelStorei(i.UNPACK_ALIGNMENT,_.unpackAlignment);let Q=m(_.image,!1,s.maxTextureSize);Q=Ut(_,Q);let ht=r.convert(_.format,_.colorSpace),Rt=r.convert(_.type),ft=S(_.internalFormat,ht,Rt,_.normalized,_.colorSpace,_.isVideoTexture);te(H,_);let ut,Nt=_.mipmaps,Bt=_.isVideoTexture!==!0,Xt=ct.__version===void 0||Y===!0,U=it.dataReady,lt=M(_,Q);if(_.isDepthTexture)ft=y(_.format===Kn,_.type),Xt&&(Bt?e.texStorage2D(i.TEXTURE_2D,1,ft,Q.width,Q.height):e.texImage2D(i.TEXTURE_2D,0,ft,Q.width,Q.height,0,ht,Rt,null));else if(_.isDataTexture)if(Nt.length>0){Bt&&Xt&&e.texStorage2D(i.TEXTURE_2D,lt,ft,Nt[0].width,Nt[0].height);for(let j=0,dt=Nt.length;j<dt;j++)ut=Nt[j],Bt?U&&e.texSubImage2D(i.TEXTURE_2D,j,0,0,ut.width,ut.height,ht,Rt,ut.data):e.texImage2D(i.TEXTURE_2D,j,ft,ut.width,ut.height,0,ht,Rt,ut.data);_.generateMipmaps=!1}else Bt?(Xt&&e.texStorage2D(i.TEXTURE_2D,lt,ft,Q.width,Q.height),U&&nt(_,Q,ht,Rt)):e.texImage2D(i.TEXTURE_2D,0,ft,Q.width,Q.height,0,ht,Rt,Q.data);else if(_.isCompressedTexture)if(_.isCompressedArrayTexture){Bt&&Xt&&e.texStorage3D(i.TEXTURE_2D_ARRAY,lt,ft,Nt[0].width,Nt[0].height,Q.depth);for(let j=0,dt=Nt.length;j<dt;j++)if(ut=Nt[j],_.format!==Qe)if(ht!==null)if(Bt){if(U)if(_.layerUpdates.size>0){let _t=Ka(ut.width,ut.height,_.format,_.type);for(let et of _.layerUpdates){let Ct=ut.data.subarray(et*_t/ut.data.BYTES_PER_ELEMENT,(et+1)*_t/ut.data.BYTES_PER_ELEMENT);e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,j,0,0,et,ut.width,ut.height,1,ht,Ct)}_.clearLayerUpdates()}else e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,j,0,0,0,ut.width,ut.height,Q.depth,ht,ut.data)}else e.compressedTexImage3D(i.TEXTURE_2D_ARRAY,j,ft,ut.width,ut.height,Q.depth,0,ut.data,0,0);else Ft("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else Bt?U&&e.texSubImage3D(i.TEXTURE_2D_ARRAY,j,0,0,0,ut.width,ut.height,Q.depth,ht,Rt,ut.data):e.texImage3D(i.TEXTURE_2D_ARRAY,j,ft,ut.width,ut.height,Q.depth,0,ht,Rt,ut.data)}else{Bt&&Xt&&e.texStorage2D(i.TEXTURE_2D,lt,ft,Nt[0].width,Nt[0].height);for(let j=0,dt=Nt.length;j<dt;j++)ut=Nt[j],_.format!==Qe?ht!==null?Bt?U&&e.compressedTexSubImage2D(i.TEXTURE_2D,j,0,0,ut.width,ut.height,ht,ut.data):e.compressedTexImage2D(i.TEXTURE_2D,j,ft,ut.width,ut.height,0,ut.data):Ft("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Bt?U&&e.texSubImage2D(i.TEXTURE_2D,j,0,0,ut.width,ut.height,ht,Rt,ut.data):e.texImage2D(i.TEXTURE_2D,j,ft,ut.width,ut.height,0,ht,Rt,ut.data)}else if(_.isDataArrayTexture)if(Bt){if(Xt&&e.texStorage3D(i.TEXTURE_2D_ARRAY,lt,ft,Q.width,Q.height,Q.depth),U)if(_.layerUpdates.size>0){let j=Ka(Q.width,Q.height,_.format,_.type);for(let dt of _.layerUpdates){let _t=Q.data.subarray(dt*j/Q.data.BYTES_PER_ELEMENT,(dt+1)*j/Q.data.BYTES_PER_ELEMENT);e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,dt,Q.width,Q.height,1,ht,Rt,_t)}_.clearLayerUpdates()}else e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,Q.width,Q.height,Q.depth,ht,Rt,Q.data)}else e.texImage3D(i.TEXTURE_2D_ARRAY,0,ft,Q.width,Q.height,Q.depth,0,ht,Rt,Q.data);else if(_.isData3DTexture)Bt?(Xt&&e.texStorage3D(i.TEXTURE_3D,lt,ft,Q.width,Q.height,Q.depth),U&&e.texSubImage3D(i.TEXTURE_3D,0,0,0,0,Q.width,Q.height,Q.depth,ht,Rt,Q.data)):e.texImage3D(i.TEXTURE_3D,0,ft,Q.width,Q.height,Q.depth,0,ht,Rt,Q.data);else if(_.isFramebufferTexture){if(Xt)if(Bt)e.texStorage2D(i.TEXTURE_2D,lt,ft,Q.width,Q.height);else{let j=Q.width,dt=Q.height;for(let _t=0;_t<lt;_t++)e.texImage2D(i.TEXTURE_2D,_t,ft,j,dt,0,ht,Rt,null),j>>=1,dt>>=1}}else if(_.isHTMLTexture){if("texElementImage2D"in i){let j=i.canvas;if(j.hasAttribute("layoutsubtree")||j.setAttribute("layoutsubtree","true"),Q.parentNode!==j){j.appendChild(Q),d.add(_),j.onpaint=dt=>{let _t=dt.changedElements;for(let et of d)_t.includes(et.image)&&(et.needsUpdate=!0)},j.requestPaint();return}if(i.texElementImage2D.length===3)i.texElementImage2D(i.TEXTURE_2D,i.RGBA8,Q);else{let _t=i.RGBA,et=i.RGBA,Ct=i.UNSIGNED_BYTE;i.texElementImage2D(i.TEXTURE_2D,0,_t,et,Ct,Q)}i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE)}}else if(Nt.length>0){if(Bt&&Xt){let j=Vt(Nt[0]);e.texStorage2D(i.TEXTURE_2D,lt,ft,j.width,j.height)}for(let j=0,dt=Nt.length;j<dt;j++)ut=Nt[j],Bt?U&&e.texSubImage2D(i.TEXTURE_2D,j,0,0,ht,Rt,ut):e.texImage2D(i.TEXTURE_2D,j,ft,ht,Rt,ut);_.generateMipmaps=!1}else if(Bt){if(Xt){let j=Vt(Q);e.texStorage2D(i.TEXTURE_2D,lt,ft,j.width,j.height)}U&&e.texSubImage2D(i.TEXTURE_2D,0,0,0,ht,Rt,Q)}else e.texImage2D(i.TEXTURE_2D,0,ft,ht,Rt,Q);p(_)&&E(H),ct.__version=it.version,_.onUpdate&&_.onUpdate(_)}A.__version=_.version}function kt(A,_,B){if(_.image.length!==6)return;let H=K(A,_),Y=_.source;e.bindTexture(i.TEXTURE_CUBE_MAP,A.__webglTexture,i.TEXTURE0+B);let it=n.get(Y);if(Y.version!==it.__version||H===!0){e.activeTexture(i.TEXTURE0+B);let ct=jt.getPrimaries(jt.workingColorSpace),$=_.colorSpace===In?null:jt.getPrimaries(_.colorSpace),Q=_.colorSpace===In||ct===$?i.NONE:i.BROWSER_DEFAULT_WEBGL;e.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,_.flipY),e.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,_.premultiplyAlpha),e.pixelStorei(i.UNPACK_ALIGNMENT,_.unpackAlignment),e.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,Q);let ht=_.isCompressedTexture||_.image[0].isCompressedTexture,Rt=_.image[0]&&_.image[0].isDataTexture,ft=[];for(let et=0;et<6;et++)!ht&&!Rt?ft[et]=m(_.image[et],!0,s.maxCubemapSize):ft[et]=Rt?_.image[et].image:_.image[et],ft[et]=Ut(_,ft[et]);let ut=ft[0],Nt=r.convert(_.format,_.colorSpace),Bt=r.convert(_.type),Xt=S(_.internalFormat,Nt,Bt,_.normalized,_.colorSpace),U=_.isVideoTexture!==!0,lt=it.__version===void 0||H===!0,j=Y.dataReady,dt=M(_,ut);te(i.TEXTURE_CUBE_MAP,_);let _t;if(ht){U&&lt&&e.texStorage2D(i.TEXTURE_CUBE_MAP,dt,Xt,ut.width,ut.height);for(let et=0;et<6;et++){_t=ft[et].mipmaps;for(let Ct=0;Ct<_t.length;Ct++){let wt=_t[Ct];_.format!==Qe?Nt!==null?U?j&&e.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+et,Ct,0,0,wt.width,wt.height,Nt,wt.data):e.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+et,Ct,Xt,wt.width,wt.height,0,wt.data):Ft("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):U?j&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+et,Ct,0,0,wt.width,wt.height,Nt,Bt,wt.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+et,Ct,Xt,wt.width,wt.height,0,Nt,Bt,wt.data)}}}else{if(_t=_.mipmaps,U&&lt){_t.length>0&&dt++;let et=Vt(ft[0]);e.texStorage2D(i.TEXTURE_CUBE_MAP,dt,Xt,et.width,et.height)}for(let et=0;et<6;et++)if(Rt){U?j&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+et,0,0,0,ft[et].width,ft[et].height,Nt,Bt,ft[et].data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+et,0,Xt,ft[et].width,ft[et].height,0,Nt,Bt,ft[et].data);for(let Ct=0;Ct<_t.length;Ct++){let me=_t[Ct].image[et].image;U?j&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+et,Ct+1,0,0,me.width,me.height,Nt,Bt,me.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+et,Ct+1,Xt,me.width,me.height,0,Nt,Bt,me.data)}}else{U?j&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+et,0,0,0,Nt,Bt,ft[et]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+et,0,Xt,Nt,Bt,ft[et]);for(let Ct=0;Ct<_t.length;Ct++){let wt=_t[Ct];U?j&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+et,Ct+1,0,0,Nt,Bt,wt.image[et]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+et,Ct+1,Xt,Nt,Bt,wt.image[et])}}}p(_)&&E(i.TEXTURE_CUBE_MAP),it.__version=Y.version,_.onUpdate&&_.onUpdate(_)}A.__version=_.version}function Et(A,_,B,H,Y,it){let ct=r.convert(B.format,B.colorSpace),$=r.convert(B.type),Q=S(B.internalFormat,ct,$,B.normalized,B.colorSpace),ht=n.get(_),Rt=n.get(B);if(Rt.__renderTarget=_,!ht.__hasExternalTextures){let ft=Math.max(1,_.width>>it),ut=Math.max(1,_.height>>it);Y===i.TEXTURE_3D||Y===i.TEXTURE_2D_ARRAY?e.texImage3D(Y,it,Q,ft,ut,_.depth,0,ct,$,null):e.texImage2D(Y,it,Q,ft,ut,0,ct,$,null)}e.bindFramebuffer(i.FRAMEBUFFER,A),Wt(_)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,H,Y,Rt.__webglTexture,0,St(_)):(Y===i.TEXTURE_2D||Y>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&Y<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,H,Y,Rt.__webglTexture,it),e.bindFramebuffer(i.FRAMEBUFFER,null)}function ie(A,_,B){if(i.bindRenderbuffer(i.RENDERBUFFER,A),_.depthBuffer){let H=_.depthTexture,Y=H&&H.isDepthTexture?H.type:null,it=y(_.stencilBuffer,Y),ct=_.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;Wt(_)?a.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,St(_),it,_.width,_.height):B?i.renderbufferStorageMultisample(i.RENDERBUFFER,St(_),it,_.width,_.height):i.renderbufferStorage(i.RENDERBUFFER,it,_.width,_.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,ct,i.RENDERBUFFER,A)}else{let H=_.textures;for(let Y=0;Y<H.length;Y++){let it=H[Y],ct=r.convert(it.format,it.colorSpace),$=r.convert(it.type),Q=S(it.internalFormat,ct,$,it.normalized,it.colorSpace);Wt(_)?a.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,St(_),Q,_.width,_.height):B?i.renderbufferStorageMultisample(i.RENDERBUFFER,St(_),Q,_.width,_.height):i.renderbufferStorage(i.RENDERBUFFER,Q,_.width,_.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function Zt(A,_,B){let H=_.isWebGLCubeRenderTarget===!0;if(e.bindFramebuffer(i.FRAMEBUFFER,A),!(_.depthTexture&&_.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");let Y=n.get(_.depthTexture);if(Y.__renderTarget=_,(!Y.__webglTexture||_.depthTexture.image.width!==_.width||_.depthTexture.image.height!==_.height)&&(_.depthTexture.image.width=_.width,_.depthTexture.image.height=_.height,_.depthTexture.needsUpdate=!0),H){if(Y.__webglInit===void 0&&(Y.__webglInit=!0,_.depthTexture.addEventListener("dispose",T)),Y.__webglTexture===void 0){Y.__webglTexture=i.createTexture(),e.bindTexture(i.TEXTURE_CUBE_MAP,Y.__webglTexture),te(i.TEXTURE_CUBE_MAP,_.depthTexture);let ht=r.convert(_.depthTexture.format),Rt=r.convert(_.depthTexture.type),ft;_.depthTexture.format===pn?ft=i.DEPTH_COMPONENT24:_.depthTexture.format===Kn&&(ft=i.DEPTH24_STENCIL8);for(let ut=0;ut<6;ut++)i.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ut,0,ft,_.width,_.height,0,ht,Rt,null)}}else Z(_.depthTexture,0);let it=Y.__webglTexture,ct=St(_),$=H?i.TEXTURE_CUBE_MAP_POSITIVE_X+B:i.TEXTURE_2D,Q=_.depthTexture.format===Kn?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;if(_.depthTexture.format===pn)Wt(_)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,Q,$,it,0,ct):i.framebufferTexture2D(i.FRAMEBUFFER,Q,$,it,0);else if(_.depthTexture.format===Kn)Wt(_)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,Q,$,it,0,ct):i.framebufferTexture2D(i.FRAMEBUFFER,Q,$,it,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function O(A){let _=n.get(A),B=A.isWebGLCubeRenderTarget===!0;if(_.__boundDepthTexture!==A.depthTexture){let H=A.depthTexture;if(_.__depthDisposeCallback&&_.__depthDisposeCallback(),H){let Y=()=>{delete _.__boundDepthTexture,delete _.__depthDisposeCallback,H.removeEventListener("dispose",Y)};H.addEventListener("dispose",Y),_.__depthDisposeCallback=Y}_.__boundDepthTexture=H}if(A.depthTexture&&!_.__autoAllocateDepthBuffer)if(B)for(let H=0;H<6;H++)Zt(_.__webglFramebuffer[H],A,H);else{let H=A.texture.mipmaps;H&&H.length>0?Zt(_.__webglFramebuffer[0],A,0):Zt(_.__webglFramebuffer,A,0)}else if(B){_.__webglDepthbuffer=[];for(let H=0;H<6;H++)if(e.bindFramebuffer(i.FRAMEBUFFER,_.__webglFramebuffer[H]),_.__webglDepthbuffer[H]===void 0)_.__webglDepthbuffer[H]=i.createRenderbuffer(),ie(_.__webglDepthbuffer[H],A,!1);else{let Y=A.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,it=_.__webglDepthbuffer[H];i.bindRenderbuffer(i.RENDERBUFFER,it),i.framebufferRenderbuffer(i.FRAMEBUFFER,Y,i.RENDERBUFFER,it)}}else{let H=A.texture.mipmaps;if(H&&H.length>0?e.bindFramebuffer(i.FRAMEBUFFER,_.__webglFramebuffer[0]):e.bindFramebuffer(i.FRAMEBUFFER,_.__webglFramebuffer),_.__webglDepthbuffer===void 0)_.__webglDepthbuffer=i.createRenderbuffer(),ie(_.__webglDepthbuffer,A,!1);else{let Y=A.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,it=_.__webglDepthbuffer;i.bindRenderbuffer(i.RENDERBUFFER,it),i.framebufferRenderbuffer(i.FRAMEBUFFER,Y,i.RENDERBUFFER,it)}}e.bindFramebuffer(i.FRAMEBUFFER,null)}function J(A,_,B){let H=n.get(A);_!==void 0&&Et(H.__webglFramebuffer,A,A.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),B!==void 0&&O(A)}function ot(A){let _=A.texture,B=n.get(A),H=n.get(_);A.addEventListener("dispose",x);let Y=A.textures,it=A.isWebGLCubeRenderTarget===!0,ct=Y.length>1;if(ct||(H.__webglTexture===void 0&&(H.__webglTexture=i.createTexture()),H.__version=_.version,o.memory.textures++),it){B.__webglFramebuffer=[];for(let $=0;$<6;$++)if(_.mipmaps&&_.mipmaps.length>0){B.__webglFramebuffer[$]=[];for(let Q=0;Q<_.mipmaps.length;Q++)B.__webglFramebuffer[$][Q]=i.createFramebuffer()}else B.__webglFramebuffer[$]=i.createFramebuffer()}else{if(_.mipmaps&&_.mipmaps.length>0){B.__webglFramebuffer=[];for(let $=0;$<_.mipmaps.length;$++)B.__webglFramebuffer[$]=i.createFramebuffer()}else B.__webglFramebuffer=i.createFramebuffer();if(ct)for(let $=0,Q=Y.length;$<Q;$++){let ht=n.get(Y[$]);ht.__webglTexture===void 0&&(ht.__webglTexture=i.createTexture(),o.memory.textures++)}if(A.samples>0&&Wt(A)===!1){B.__webglMultisampledFramebuffer=i.createFramebuffer(),B.__webglColorRenderbuffer=[],e.bindFramebuffer(i.FRAMEBUFFER,B.__webglMultisampledFramebuffer);for(let $=0;$<Y.length;$++){let Q=Y[$];B.__webglColorRenderbuffer[$]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,B.__webglColorRenderbuffer[$]);let ht=r.convert(Q.format,Q.colorSpace),Rt=r.convert(Q.type),ft=S(Q.internalFormat,ht,Rt,Q.normalized,Q.colorSpace,A.isXRRenderTarget===!0),ut=St(A);i.renderbufferStorageMultisample(i.RENDERBUFFER,ut,ft,A.width,A.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+$,i.RENDERBUFFER,B.__webglColorRenderbuffer[$])}i.bindRenderbuffer(i.RENDERBUFFER,null),A.depthBuffer&&(B.__webglDepthRenderbuffer=i.createRenderbuffer(),ie(B.__webglDepthRenderbuffer,A,!0)),e.bindFramebuffer(i.FRAMEBUFFER,null)}}if(it){e.bindTexture(i.TEXTURE_CUBE_MAP,H.__webglTexture),te(i.TEXTURE_CUBE_MAP,_);for(let $=0;$<6;$++)if(_.mipmaps&&_.mipmaps.length>0)for(let Q=0;Q<_.mipmaps.length;Q++)Et(B.__webglFramebuffer[$][Q],A,_,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+$,Q);else Et(B.__webglFramebuffer[$],A,_,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+$,0);p(_)&&E(i.TEXTURE_CUBE_MAP),e.unbindTexture()}else if(ct){for(let $=0,Q=Y.length;$<Q;$++){let ht=Y[$],Rt=n.get(ht),ft=i.TEXTURE_2D;(A.isWebGL3DRenderTarget||A.isWebGLArrayRenderTarget)&&(ft=A.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture(ft,Rt.__webglTexture),te(ft,ht),Et(B.__webglFramebuffer,A,ht,i.COLOR_ATTACHMENT0+$,ft,0),p(ht)&&E(ft)}e.unbindTexture()}else{let $=i.TEXTURE_2D;if((A.isWebGL3DRenderTarget||A.isWebGLArrayRenderTarget)&&($=A.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture($,H.__webglTexture),te($,_),_.mipmaps&&_.mipmaps.length>0)for(let Q=0;Q<_.mipmaps.length;Q++)Et(B.__webglFramebuffer[Q],A,_,i.COLOR_ATTACHMENT0,$,Q);else Et(B.__webglFramebuffer,A,_,i.COLOR_ATTACHMENT0,$,0);p(_)&&E($),e.unbindTexture()}A.depthBuffer&&O(A)}function bt(A){let _=A.textures;for(let B=0,H=_.length;B<H;B++){let Y=_[B];if(p(Y)){let it=C(A),ct=n.get(Y).__webglTexture;e.bindTexture(it,ct),E(it),e.unbindTexture()}}}let At=[],vt=[];function Pt(A){if(A.samples>0){if(Wt(A)===!1){let _=A.textures,B=A.width,H=A.height,Y=i.COLOR_BUFFER_BIT,it=A.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,ct=n.get(A),$=_.length>1;if($)for(let ht=0;ht<_.length;ht++)e.bindFramebuffer(i.FRAMEBUFFER,ct.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+ht,i.RENDERBUFFER,null),e.bindFramebuffer(i.FRAMEBUFFER,ct.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+ht,i.TEXTURE_2D,null,0);e.bindFramebuffer(i.READ_FRAMEBUFFER,ct.__webglMultisampledFramebuffer);let Q=A.texture.mipmaps;Q&&Q.length>0?e.bindFramebuffer(i.DRAW_FRAMEBUFFER,ct.__webglFramebuffer[0]):e.bindFramebuffer(i.DRAW_FRAMEBUFFER,ct.__webglFramebuffer);for(let ht=0;ht<_.length;ht++){if(A.resolveDepthBuffer&&(A.depthBuffer&&(Y|=i.DEPTH_BUFFER_BIT),A.stencilBuffer&&A.resolveStencilBuffer&&(Y|=i.STENCIL_BUFFER_BIT)),$){i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,ct.__webglColorRenderbuffer[ht]);let Rt=n.get(_[ht]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,Rt,0)}i.blitFramebuffer(0,0,B,H,0,0,B,H,Y,i.NEAREST),l===!0&&(At.length=0,vt.length=0,At.push(i.COLOR_ATTACHMENT0+ht),A.depthBuffer&&A.resolveDepthBuffer===!1&&(At.push(it),vt.push(it),i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,vt)),i.invalidateFramebuffer(i.READ_FRAMEBUFFER,At))}if(e.bindFramebuffer(i.READ_FRAMEBUFFER,null),e.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),$)for(let ht=0;ht<_.length;ht++){e.bindFramebuffer(i.FRAMEBUFFER,ct.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+ht,i.RENDERBUFFER,ct.__webglColorRenderbuffer[ht]);let Rt=n.get(_[ht]).__webglTexture;e.bindFramebuffer(i.FRAMEBUFFER,ct.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+ht,i.TEXTURE_2D,Rt,0)}e.bindFramebuffer(i.DRAW_FRAMEBUFFER,ct.__webglMultisampledFramebuffer)}else if(A.depthBuffer&&A.resolveDepthBuffer===!1&&l){let _=A.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[_])}}}function St(A){return Math.min(s.maxSamples,A.samples)}function Wt(A){let _=n.get(A);return A.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&_.__useRenderToTexture!==!1}function P(A){let _=o.render.frame;h.get(A)!==_&&(h.set(A,_),A.update())}function Ut(A,_){let B=A.colorSpace,H=A.format,Y=A.type;return A.isCompressedTexture===!0||A.isVideoTexture===!0||B!==ls&&B!==In&&(jt.getTransfer(B)===ne?(H!==Qe||Y!==Be)&&Ft("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):zt("WebGLTextures: Unsupported texture color space:",B)),_}function Vt(A){return typeof HTMLImageElement<"u"&&A instanceof HTMLImageElement?(c.width=A.naturalWidth||A.width,c.height=A.naturalHeight||A.height):typeof VideoFrame<"u"&&A instanceof VideoFrame?(c.width=A.displayWidth,c.height=A.displayHeight):(c.width=A.width,c.height=A.height),c}this.allocateTextureUnit=k,this.resetTextureUnits=X,this.getTextureUnits=W,this.setTextureUnits=L,this.setTexture2D=Z,this.setTexture2DArray=tt,this.setTexture3D=rt,this.setTextureCube=st,this.rebindTextures=J,this.setupRenderTarget=ot,this.updateRenderTargetMipmap=bt,this.updateMultisampleRenderTarget=Pt,this.setupDepthRenderbuffer=O,this.setupFrameBufferTexture=Et,this.useMultisampledRTT=Wt,this.isReversedDepthBuffer=function(){return e.buffers.depth.getReversed()}}function ag(i,t){function e(n,s=In){let r,o=jt.getTransfer(s);if(n===Be)return i.UNSIGNED_BYTE;if(n===Yr)return i.UNSIGNED_SHORT_4_4_4_4;if(n===$r)return i.UNSIGNED_SHORT_5_5_5_1;if(n===ka)return i.UNSIGNED_INT_5_9_9_9_REV;if(n===Va)return i.UNSIGNED_INT_10F_11F_11F_REV;if(n===Ba)return i.BYTE;if(n===za)return i.SHORT;if(n===$i)return i.UNSIGNED_SHORT;if(n===qr)return i.INT;if(n===on)return i.UNSIGNED_INT;if(n===an)return i.FLOAT;if(n===xn)return i.HALF_FLOAT;if(n===Ha)return i.ALPHA;if(n===Ga)return i.RGB;if(n===Qe)return i.RGBA;if(n===pn)return i.DEPTH_COMPONENT;if(n===Kn)return i.DEPTH_STENCIL;if(n===Wa)return i.RED;if(n===Zr)return i.RED_INTEGER;if(n===jn)return i.RG;if(n===Jr)return i.RG_INTEGER;if(n===Kr)return i.RGBA_INTEGER;if(n===Rs||n===Is||n===Ps||n===Ls)if(o===ne)if(r=t.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===Rs)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===Is)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===Ps)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===Ls)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=t.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===Rs)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Is)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===Ps)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===Ls)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===jr||n===Qr||n===to||n===eo)if(r=t.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===jr)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===Qr)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===to)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===eo)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===no||n===io||n===so||n===ro||n===oo||n===Ds||n===ao)if(r=t.get("WEBGL_compressed_texture_etc"),r!==null){if(n===no||n===io)return o===ne?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===so)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC;if(n===ro)return r.COMPRESSED_R11_EAC;if(n===oo)return r.COMPRESSED_SIGNED_R11_EAC;if(n===Ds)return r.COMPRESSED_RG11_EAC;if(n===ao)return r.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===lo||n===co||n===ho||n===uo||n===fo||n===po||n===mo||n===go||n===xo||n===_o||n===vo||n===yo||n===bo||n===Mo)if(r=t.get("WEBGL_compressed_texture_astc"),r!==null){if(n===lo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===co)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===ho)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===uo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===fo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===po)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===mo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===go)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===xo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===_o)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===vo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===yo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===bo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===Mo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===So||n===Eo||n===wo)if(r=t.get("EXT_texture_compression_bptc"),r!==null){if(n===So)return o===ne?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===Eo)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===wo)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===To||n===Ao||n===Ns||n===Co)if(r=t.get("EXT_texture_compression_rgtc"),r!==null){if(n===To)return r.COMPRESSED_RED_RGTC1_EXT;if(n===Ao)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===Ns)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===Co)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===Zi?i.UNSIGNED_INT_24_8:i[n]!==void 0?i[n]:null}return{convert:e}}var lg=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,cg=`
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

}`,ul=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,e){if(this.texture===null){let n=new _s(t.texture);(t.depthNear!==e.depthNear||t.depthFar!==e.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=n}}getMesh(t){if(this.texture!==null&&this.mesh===null){let e=t.cameras[0].viewport,n=new Ye({vertexShader:lg,fragmentShader:cg,uniforms:{depthColor:{value:this.texture},depthWidth:{value:e.z},depthHeight:{value:e.w}}});this.mesh=new ue(new ys(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},dl=class extends mn{constructor(t,e){super();let n=this,s=null,r=1,o=null,a="local-floor",l=1,c=null,h=null,d=null,u=null,f=null,g=null,v=typeof XRWebGLBinding<"u",m=new ul,p={},E=e.getContextAttributes(),C=null,S=null,y=[],M=[],T=new Yt,x=null,w=new Ie;w.viewport=new pe;let R=new Ie;R.viewport=new pe;let I=[w,R],D=new Hr,X=null,W=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(K){let at=y[K];return at===void 0&&(at=new Bi,y[K]=at),at.getTargetRaySpace()},this.getControllerGrip=function(K){let at=y[K];return at===void 0&&(at=new Bi,y[K]=at),at.getGripSpace()},this.getHand=function(K){let at=y[K];return at===void 0&&(at=new Bi,y[K]=at),at.getHandSpace()};function L(K){let at=M.indexOf(K.inputSource);if(at===-1)return;let nt=y[at];nt!==void 0&&(nt.update(K.inputSource,K.frame,c||o),nt.dispatchEvent({type:K.type,data:K.inputSource}))}function k(){s.removeEventListener("select",L),s.removeEventListener("selectstart",L),s.removeEventListener("selectend",L),s.removeEventListener("squeeze",L),s.removeEventListener("squeezestart",L),s.removeEventListener("squeezeend",L),s.removeEventListener("end",k),s.removeEventListener("inputsourceschange",z);for(let K=0;K<y.length;K++){let at=M[K];at!==null&&(M[K]=null,y[K].disconnect(at))}X=null,W=null,m.reset();for(let K in p)delete p[K];t.setRenderTarget(C),f=null,u=null,d=null,s=null,S=null,te.stop(),n.isPresenting=!1,t.setPixelRatio(x),t.setSize(T.width,T.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(K){r=K,n.isPresenting===!0&&Ft("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(K){a=K,n.isPresenting===!0&&Ft("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||o},this.setReferenceSpace=function(K){c=K},this.getBaseLayer=function(){return u!==null?u:f},this.getBinding=function(){return d===null&&v&&(d=new XRWebGLBinding(s,e)),d},this.getFrame=function(){return g},this.getSession=function(){return s},this.setSession=async function(K){if(s=K,s!==null){if(C=t.getRenderTarget(),s.addEventListener("select",L),s.addEventListener("selectstart",L),s.addEventListener("selectend",L),s.addEventListener("squeeze",L),s.addEventListener("squeezestart",L),s.addEventListener("squeezeend",L),s.addEventListener("end",k),s.addEventListener("inputsourceschange",z),E.xrCompatible!==!0&&await e.makeXRCompatible(),x=t.getPixelRatio(),t.getSize(T),v&&"createProjectionLayer"in XRWebGLBinding.prototype){let nt=null,Ot=null,kt=null;E.depth&&(kt=E.stencil?e.DEPTH24_STENCIL8:e.DEPTH_COMPONENT24,nt=E.stencil?Kn:pn,Ot=E.stencil?Zi:on);let Et={colorFormat:e.RGBA8,depthFormat:kt,scaleFactor:r};d=this.getBinding(),u=d.createProjectionLayer(Et),s.updateRenderState({layers:[u]}),t.setPixelRatio(1),t.setSize(u.textureWidth,u.textureHeight,!1),S=new Xe(u.textureWidth,u.textureHeight,{format:Qe,type:Be,depthTexture:new Rn(u.textureWidth,u.textureHeight,Ot,void 0,void 0,void 0,void 0,void 0,void 0,nt),stencilBuffer:E.stencil,colorSpace:t.outputColorSpace,samples:E.antialias?4:0,resolveDepthBuffer:u.ignoreDepthValues===!1,resolveStencilBuffer:u.ignoreDepthValues===!1})}else{let nt={antialias:E.antialias,alpha:!0,depth:E.depth,stencil:E.stencil,framebufferScaleFactor:r};f=new XRWebGLLayer(s,e,nt),s.updateRenderState({baseLayer:f}),t.setPixelRatio(1),t.setSize(f.framebufferWidth,f.framebufferHeight,!1),S=new Xe(f.framebufferWidth,f.framebufferHeight,{format:Qe,type:Be,colorSpace:t.outputColorSpace,stencilBuffer:E.stencil,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1})}S.isXRRenderTarget=!0,this.setFoveation(l),c=null,o=await s.requestReferenceSpace(a),te.setContext(s),te.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return m.getDepthTexture()};function z(K){for(let at=0;at<K.removed.length;at++){let nt=K.removed[at],Ot=M.indexOf(nt);Ot>=0&&(M[Ot]=null,y[Ot].disconnect(nt))}for(let at=0;at<K.added.length;at++){let nt=K.added[at],Ot=M.indexOf(nt);if(Ot===-1){for(let Et=0;Et<y.length;Et++)if(Et>=M.length){M.push(nt),Ot=Et;break}else if(M[Et]===null){M[Et]=nt,Ot=Et;break}if(Ot===-1)break}let kt=y[Ot];kt&&kt.connect(nt)}}let Z=new N,tt=new N;function rt(K,at,nt){Z.setFromMatrixPosition(at.matrixWorld),tt.setFromMatrixPosition(nt.matrixWorld);let Ot=Z.distanceTo(tt),kt=at.projectionMatrix.elements,Et=nt.projectionMatrix.elements,ie=kt[14]/(kt[10]-1),Zt=kt[14]/(kt[10]+1),O=(kt[9]+1)/kt[5],J=(kt[9]-1)/kt[5],ot=(kt[8]-1)/kt[0],bt=(Et[8]+1)/Et[0],At=ie*ot,vt=ie*bt,Pt=Ot/(-ot+bt),St=Pt*-ot;if(at.matrixWorld.decompose(K.position,K.quaternion,K.scale),K.translateX(St),K.translateZ(Pt),K.matrixWorld.compose(K.position,K.quaternion,K.scale),K.matrixWorldInverse.copy(K.matrixWorld).invert(),kt[10]===-1)K.projectionMatrix.copy(at.projectionMatrix),K.projectionMatrixInverse.copy(at.projectionMatrixInverse);else{let Wt=ie+Pt,P=Zt+Pt,Ut=At-St,Vt=vt+(Ot-St),A=O*Zt/P*Wt,_=J*Zt/P*Wt;K.projectionMatrix.makePerspective(Ut,Vt,A,_,Wt,P),K.projectionMatrixInverse.copy(K.projectionMatrix).invert()}}function st(K,at){at===null?K.matrixWorld.copy(K.matrix):K.matrixWorld.multiplyMatrices(at.matrixWorld,K.matrix),K.matrixWorldInverse.copy(K.matrixWorld).invert()}this.updateCamera=function(K){if(s===null)return;let at=K.near,nt=K.far;m.texture!==null&&(m.depthNear>0&&(at=m.depthNear),m.depthFar>0&&(nt=m.depthFar)),D.near=R.near=w.near=at,D.far=R.far=w.far=nt,(X!==D.near||W!==D.far)&&(s.updateRenderState({depthNear:D.near,depthFar:D.far}),X=D.near,W=D.far),D.layers.mask=K.layers.mask|6,w.layers.mask=D.layers.mask&-5,R.layers.mask=D.layers.mask&-3;let Ot=K.parent,kt=D.cameras;st(D,Ot);for(let Et=0;Et<kt.length;Et++)st(kt[Et],Ot);kt.length===2?rt(D,w,R):D.projectionMatrix.copy(w.projectionMatrix),xt(K,D,Ot)};function xt(K,at,nt){nt===null?K.matrix.copy(at.matrixWorld):(K.matrix.copy(nt.matrixWorld),K.matrix.invert(),K.matrix.multiply(at.matrixWorld)),K.matrix.decompose(K.position,K.quaternion,K.scale),K.updateMatrixWorld(!0),K.projectionMatrix.copy(at.projectionMatrix),K.projectionMatrixInverse.copy(at.projectionMatrixInverse),K.isPerspectiveCamera&&(K.fov=Ui*2*Math.atan(1/K.projectionMatrix.elements[5]),K.zoom=1)}this.getCamera=function(){return D},this.getFoveation=function(){if(!(u===null&&f===null))return l},this.setFoveation=function(K){l=K,u!==null&&(u.fixedFoveation=K),f!==null&&f.fixedFoveation!==void 0&&(f.fixedFoveation=K)},this.hasDepthSensing=function(){return m.texture!==null},this.getDepthSensingMesh=function(){return m.getMesh(D)},this.getCameraTexture=function(K){return p[K]};let Kt=null;function de(K,at){if(h=at.getViewerPose(c||o),g=at,h!==null){let nt=h.views;f!==null&&(t.setRenderTargetFramebuffer(S,f.framebuffer),t.setRenderTarget(S));let Ot=!1;nt.length!==D.cameras.length&&(D.cameras.length=0,Ot=!0);for(let Zt=0;Zt<nt.length;Zt++){let O=nt[Zt],J=null;if(f!==null)J=f.getViewport(O);else{let bt=d.getViewSubImage(u,O);J=bt.viewport,Zt===0&&(t.setRenderTargetTextures(S,bt.colorTexture,bt.depthStencilTexture),t.setRenderTarget(S))}let ot=I[Zt];ot===void 0&&(ot=new Ie,ot.layers.enable(Zt),ot.viewport=new pe,I[Zt]=ot),ot.matrix.fromArray(O.transform.matrix),ot.matrix.decompose(ot.position,ot.quaternion,ot.scale),ot.projectionMatrix.fromArray(O.projectionMatrix),ot.projectionMatrixInverse.copy(ot.projectionMatrix).invert(),ot.viewport.set(J.x,J.y,J.width,J.height),Zt===0&&(D.matrix.copy(ot.matrix),D.matrix.decompose(D.position,D.quaternion,D.scale)),Ot===!0&&D.cameras.push(ot)}let kt=s.enabledFeatures;if(kt&&kt.includes("depth-sensing")&&s.depthUsage=="gpu-optimized"&&v){d=n.getBinding();let Zt=d.getDepthInformation(nt[0]);Zt&&Zt.isValid&&Zt.texture&&m.init(Zt,s.renderState)}if(kt&&kt.includes("camera-access")&&v){t.state.unbindTexture(),d=n.getBinding();for(let Zt=0;Zt<nt.length;Zt++){let O=nt[Zt].camera;if(O){let J=p[O];J||(J=new _s,p[O]=J);let ot=d.getCameraImage(O);J.sourceTexture=ot}}}}for(let nt=0;nt<y.length;nt++){let Ot=M[nt],kt=y[nt];Ot!==null&&kt!==void 0&&kt.update(Ot,at,c||o)}Kt&&Kt(K,at),at.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:at}),g=null}let te=new ih;te.setAnimationLoop(de),this.setAnimationLoop=function(K){Kt=K},this.dispose=function(){}}},hg=new fe,ch=new Ht;ch.set(-1,0,0,0,1,0,0,0,1);function ug(i,t){function e(m,p){m.matrixAutoUpdate===!0&&m.updateMatrix(),p.value.copy(m.matrix)}function n(m,p){p.color.getRGB(m.fogColor.value,$a(i)),p.isFog?(m.fogNear.value=p.near,m.fogFar.value=p.far):p.isFogExp2&&(m.fogDensity.value=p.density)}function s(m,p,E,C,S){p.isNodeMaterial?p.uniformsNeedUpdate=!1:p.isMeshBasicMaterial?r(m,p):p.isMeshLambertMaterial?(r(m,p),p.envMap&&(m.envMapIntensity.value=p.envMapIntensity)):p.isMeshToonMaterial?(r(m,p),d(m,p)):p.isMeshPhongMaterial?(r(m,p),h(m,p),p.envMap&&(m.envMapIntensity.value=p.envMapIntensity)):p.isMeshStandardMaterial?(r(m,p),u(m,p),p.isMeshPhysicalMaterial&&f(m,p,S)):p.isMeshMatcapMaterial?(r(m,p),g(m,p)):p.isMeshDepthMaterial?r(m,p):p.isMeshDistanceMaterial?(r(m,p),v(m,p)):p.isMeshNormalMaterial?r(m,p):p.isLineBasicMaterial?(o(m,p),p.isLineDashedMaterial&&a(m,p)):p.isPointsMaterial?l(m,p,E,C):p.isSpriteMaterial?c(m,p):p.isShadowMaterial?(m.color.value.copy(p.color),m.opacity.value=p.opacity):p.isShaderMaterial&&(p.uniformsNeedUpdate=!1)}function r(m,p){m.opacity.value=p.opacity,p.color&&m.diffuse.value.copy(p.color),p.emissive&&m.emissive.value.copy(p.emissive).multiplyScalar(p.emissiveIntensity),p.map&&(m.map.value=p.map,e(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,e(p.alphaMap,m.alphaMapTransform)),p.bumpMap&&(m.bumpMap.value=p.bumpMap,e(p.bumpMap,m.bumpMapTransform),m.bumpScale.value=p.bumpScale,p.side===Te&&(m.bumpScale.value*=-1)),p.normalMap&&(m.normalMap.value=p.normalMap,e(p.normalMap,m.normalMapTransform),m.normalScale.value.copy(p.normalScale),p.side===Te&&m.normalScale.value.negate()),p.displacementMap&&(m.displacementMap.value=p.displacementMap,e(p.displacementMap,m.displacementMapTransform),m.displacementScale.value=p.displacementScale,m.displacementBias.value=p.displacementBias),p.emissiveMap&&(m.emissiveMap.value=p.emissiveMap,e(p.emissiveMap,m.emissiveMapTransform)),p.specularMap&&(m.specularMap.value=p.specularMap,e(p.specularMap,m.specularMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest);let E=t.get(p),C=E.envMap,S=E.envMapRotation;C&&(m.envMap.value=C,m.envMapRotation.value.setFromMatrix4(hg.makeRotationFromEuler(S)).transpose(),C.isCubeTexture&&C.isRenderTargetTexture===!1&&m.envMapRotation.value.premultiply(ch),m.reflectivity.value=p.reflectivity,m.ior.value=p.ior,m.refractionRatio.value=p.refractionRatio),p.lightMap&&(m.lightMap.value=p.lightMap,m.lightMapIntensity.value=p.lightMapIntensity,e(p.lightMap,m.lightMapTransform)),p.aoMap&&(m.aoMap.value=p.aoMap,m.aoMapIntensity.value=p.aoMapIntensity,e(p.aoMap,m.aoMapTransform))}function o(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,p.map&&(m.map.value=p.map,e(p.map,m.mapTransform))}function a(m,p){m.dashSize.value=p.dashSize,m.totalSize.value=p.dashSize+p.gapSize,m.scale.value=p.scale}function l(m,p,E,C){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.size.value=p.size*E,m.scale.value=C*.5,p.map&&(m.map.value=p.map,e(p.map,m.uvTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,e(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function c(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.rotation.value=p.rotation,p.map&&(m.map.value=p.map,e(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,e(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function h(m,p){m.specular.value.copy(p.specular),m.shininess.value=Math.max(p.shininess,1e-4)}function d(m,p){p.gradientMap&&(m.gradientMap.value=p.gradientMap)}function u(m,p){m.metalness.value=p.metalness,p.metalnessMap&&(m.metalnessMap.value=p.metalnessMap,e(p.metalnessMap,m.metalnessMapTransform)),m.roughness.value=p.roughness,p.roughnessMap&&(m.roughnessMap.value=p.roughnessMap,e(p.roughnessMap,m.roughnessMapTransform)),p.envMap&&(m.envMapIntensity.value=p.envMapIntensity)}function f(m,p,E){m.ior.value=p.ior,p.sheen>0&&(m.sheenColor.value.copy(p.sheenColor).multiplyScalar(p.sheen),m.sheenRoughness.value=p.sheenRoughness,p.sheenColorMap&&(m.sheenColorMap.value=p.sheenColorMap,e(p.sheenColorMap,m.sheenColorMapTransform)),p.sheenRoughnessMap&&(m.sheenRoughnessMap.value=p.sheenRoughnessMap,e(p.sheenRoughnessMap,m.sheenRoughnessMapTransform))),p.clearcoat>0&&(m.clearcoat.value=p.clearcoat,m.clearcoatRoughness.value=p.clearcoatRoughness,p.clearcoatMap&&(m.clearcoatMap.value=p.clearcoatMap,e(p.clearcoatMap,m.clearcoatMapTransform)),p.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=p.clearcoatRoughnessMap,e(p.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),p.clearcoatNormalMap&&(m.clearcoatNormalMap.value=p.clearcoatNormalMap,e(p.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(p.clearcoatNormalScale),p.side===Te&&m.clearcoatNormalScale.value.negate())),p.dispersion>0&&(m.dispersion.value=p.dispersion),p.iridescence>0&&(m.iridescence.value=p.iridescence,m.iridescenceIOR.value=p.iridescenceIOR,m.iridescenceThicknessMinimum.value=p.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=p.iridescenceThicknessRange[1],p.iridescenceMap&&(m.iridescenceMap.value=p.iridescenceMap,e(p.iridescenceMap,m.iridescenceMapTransform)),p.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=p.iridescenceThicknessMap,e(p.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),p.transmission>0&&(m.transmission.value=p.transmission,m.transmissionSamplerMap.value=E.texture,m.transmissionSamplerSize.value.set(E.width,E.height),p.transmissionMap&&(m.transmissionMap.value=p.transmissionMap,e(p.transmissionMap,m.transmissionMapTransform)),m.thickness.value=p.thickness,p.thicknessMap&&(m.thicknessMap.value=p.thicknessMap,e(p.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=p.attenuationDistance,m.attenuationColor.value.copy(p.attenuationColor)),p.anisotropy>0&&(m.anisotropyVector.value.set(p.anisotropy*Math.cos(p.anisotropyRotation),p.anisotropy*Math.sin(p.anisotropyRotation)),p.anisotropyMap&&(m.anisotropyMap.value=p.anisotropyMap,e(p.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=p.specularIntensity,m.specularColor.value.copy(p.specularColor),p.specularColorMap&&(m.specularColorMap.value=p.specularColorMap,e(p.specularColorMap,m.specularColorMapTransform)),p.specularIntensityMap&&(m.specularIntensityMap.value=p.specularIntensityMap,e(p.specularIntensityMap,m.specularIntensityMapTransform))}function g(m,p){p.matcap&&(m.matcap.value=p.matcap)}function v(m,p){let E=t.get(p).light;m.referencePosition.value.setFromMatrixPosition(E.matrixWorld),m.nearDistance.value=E.shadow.camera.near,m.farDistance.value=E.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:s}}function dg(i,t,e,n){let s={},r={},o=[],a=i.getParameter(i.MAX_UNIFORM_BUFFER_BINDINGS);function l(S,y){let M=y.program;n.uniformBlockBinding(S,M)}function c(S,y){let M=s[S.id];M===void 0&&(m(S),M=h(S),s[S.id]=M,S.addEventListener("dispose",E));let T=y.program;n.updateUBOMapping(S,T);let x=t.render.frame;r[S.id]!==x&&(u(S),r[S.id]=x)}function h(S){let y=d();S.__bindingPointIndex=y;let M=i.createBuffer(),T=S.__size,x=S.usage;return i.bindBuffer(i.UNIFORM_BUFFER,M),i.bufferData(i.UNIFORM_BUFFER,T,x),i.bindBuffer(i.UNIFORM_BUFFER,null),i.bindBufferBase(i.UNIFORM_BUFFER,y,M),M}function d(){for(let S=0;S<a;S++)if(o.indexOf(S)===-1)return o.push(S),S;return zt("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function u(S){let y=s[S.id],M=S.uniforms,T=S.__cache;i.bindBuffer(i.UNIFORM_BUFFER,y);for(let x=0,w=M.length;x<w;x++){let R=M[x];if(Array.isArray(R))for(let I=0,D=R.length;I<D;I++)f(R[I],x,I,T);else f(R,x,0,T)}i.bindBuffer(i.UNIFORM_BUFFER,null)}function f(S,y,M,T){if(v(S,y,M,T)===!0){let x=S.__offset,w=S.value;if(Array.isArray(w)){let R=0;for(let I=0;I<w.length;I++){let D=w[I],X=p(D);g(D,S.__data,R),typeof D!="number"&&typeof D!="boolean"&&!D.isMatrix3&&!ArrayBuffer.isView(D)&&(R+=X.storage/Float32Array.BYTES_PER_ELEMENT)}}else g(w,S.__data,0);i.bufferSubData(i.UNIFORM_BUFFER,x,S.__data)}}function g(S,y,M){typeof S=="number"||typeof S=="boolean"?y[0]=S:S.isMatrix3?(y[0]=S.elements[0],y[1]=S.elements[1],y[2]=S.elements[2],y[3]=0,y[4]=S.elements[3],y[5]=S.elements[4],y[6]=S.elements[5],y[7]=0,y[8]=S.elements[6],y[9]=S.elements[7],y[10]=S.elements[8],y[11]=0):ArrayBuffer.isView(S)?y.set(new S.constructor(S.buffer,S.byteOffset,y.length)):S.toArray(y,M)}function v(S,y,M,T){let x=S.value,w=y+"_"+M;if(T[w]===void 0)return typeof x=="number"||typeof x=="boolean"?T[w]=x:ArrayBuffer.isView(x)?T[w]=x.slice():T[w]=x.clone(),!0;{let R=T[w];if(typeof x=="number"||typeof x=="boolean"){if(R!==x)return T[w]=x,!0}else{if(ArrayBuffer.isView(x))return!0;if(R.equals(x)===!1)return R.copy(x),!0}}return!1}function m(S){let y=S.uniforms,M=0,T=16;for(let w=0,R=y.length;w<R;w++){let I=Array.isArray(y[w])?y[w]:[y[w]];for(let D=0,X=I.length;D<X;D++){let W=I[D],L=Array.isArray(W.value)?W.value:[W.value];for(let k=0,z=L.length;k<z;k++){let Z=L[k],tt=p(Z),rt=M%T,st=rt%tt.boundary,xt=rt+st;M+=st,xt!==0&&T-xt<tt.storage&&(M+=T-xt),W.__data=new Float32Array(tt.storage/Float32Array.BYTES_PER_ELEMENT),W.__offset=M,M+=tt.storage}}}let x=M%T;return x>0&&(M+=T-x),S.__size=M,S.__cache={},this}function p(S){let y={boundary:0,storage:0};return typeof S=="number"||typeof S=="boolean"?(y.boundary=4,y.storage=4):S.isVector2?(y.boundary=8,y.storage=8):S.isVector3||S.isColor?(y.boundary=16,y.storage=12):S.isVector4?(y.boundary=16,y.storage=16):S.isMatrix3?(y.boundary=48,y.storage=48):S.isMatrix4?(y.boundary=64,y.storage=64):S.isTexture?Ft("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(S)?(y.boundary=16,y.storage=S.byteLength):Ft("WebGLRenderer: Unsupported uniform value type.",S),y}function E(S){let y=S.target;y.removeEventListener("dispose",E);let M=o.indexOf(y.__bindingPointIndex);o.splice(M,1),i.deleteBuffer(s[y.id]),delete s[y.id],delete r[y.id]}function C(){for(let S in s)i.deleteBuffer(s[S]);o=[],s={},r={}}return{bind:l,update:c,dispose:C}}var fg=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),_n=null;function pg(){return _n===null&&(_n=new Tr(fg,16,16,jn,xn),_n.name="DFG_LUT",_n.minFilter=we,_n.magFilter=we,_n.wrapS=fn,_n.wrapT=fn,_n.generateMipmaps=!1,_n.needsUpdate=!0),_n}var Fo=class{constructor(t={}){let{canvas:e=Cc(),context:n=null,depth:s=!0,stencil:r=!1,alpha:o=!1,antialias:a=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:d=!1,reversedDepthBuffer:u=!1,outputBufferType:f=Be}=t;this.isWebGLRenderer=!0;let g;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");g=n.getContextAttributes().alpha}else g=o;let v=f,m=new Set([Kr,Jr,Zr]),p=new Set([Be,on,$i,Zi,Yr,$r]),E=new Uint32Array(4),C=new Int32Array(4),S=new N,y=null,M=null,T=[],x=[],w=null;this.domElement=e,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=rn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let R=this,I=!1,D=null,X=null,W=null,L=null;this._outputColorSpace=He;let k=0,z=0,Z=null,tt=-1,rt=null,st=new pe,xt=new pe,Kt=null,de=new Gt(0),te=0,K=e.width,at=e.height,nt=1,Ot=null,kt=null,Et=new pe(0,0,K,at),ie=new pe(0,0,K,at),Zt=!1,O=new ki,J=!1,ot=!1,bt=new fe,At=new N,vt=new pe,Pt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},St=!1;function Wt(){return Z===null?nt:1}let P=n;function Ut(b,F){return e.getContext(b,F)}try{let b={alpha:!0,depth:s,stencil:r,antialias:a,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:d};if("setAttribute"in e&&e.setAttribute("data-engine",`three.js r${"185"}`),e.addEventListener("webglcontextlost",me,!1),e.addEventListener("webglcontextrestored",le,!1),e.addEventListener("webglcontextcreationerror",cn,!1),P===null){let F="webgl2";if(P=Ut(F,b),P===null)throw Ut(F)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}}catch(b){throw zt("WebGLRenderer: "+b.message),b}let Vt,A,_,B,H,Y,it,ct,$,Q,ht,Rt,ft,ut,Nt,Bt,Xt,U,lt,j,dt,_t,et;function Ct(){Vt=new bp(P),Vt.init(),dt=new ag(P,Vt),A=new fp(P,Vt,t,dt),_=new rg(P,Vt),A.reversedDepthBuffer&&u&&_.buffers.depth.setReversed(!0),X=P.createFramebuffer(),W=P.createFramebuffer(),L=P.createFramebuffer(),B=new Ep(P),H=new Xm,Y=new og(P,Vt,_,H,A,dt,B),it=new yp(R),ct=new Au(P),_t=new up(P,ct),$=new Mp(P,ct,B,_t),Q=new Tp(P,$,ct,_t,B),U=new wp(P,A,Y),Nt=new pp(H),ht=new Wm(R,it,Vt,A,_t,Nt),Rt=new ug(R,H),ft=new Ym,ut=new Qm(Vt),Xt=new hp(R,it,_,Q,g,l),Bt=new sg(R,Q,A),et=new dg(P,B,A,_),lt=new dp(P,Vt,B),j=new Sp(P,Vt,B),B.programs=ht.programs,R.capabilities=A,R.extensions=Vt,R.properties=H,R.renderLists=ft,R.shadowMap=Bt,R.state=_,R.info=B}Ct(),v!==Be&&(w=new Cp(v,e.width,e.height,a,s,r));let wt=new dl(R,P);this.xr=wt,this.getContext=function(){return P},this.getContextAttributes=function(){return P.getContextAttributes()},this.forceContextLoss=function(){let b=Vt.get("WEBGL_lose_context");b&&b.loseContext()},this.forceContextRestore=function(){let b=Vt.get("WEBGL_lose_context");b&&b.restoreContext()},this.getPixelRatio=function(){return nt},this.setPixelRatio=function(b){b!==void 0&&(nt=b,this.setSize(K,at,!1))},this.getSize=function(b){return b.set(K,at)},this.setSize=function(b,F,q=!0){if(wt.isPresenting){Ft("WebGLRenderer: Can't change size while VR device is presenting.");return}K=b,at=F,e.width=Math.floor(b*nt),e.height=Math.floor(F*nt),q===!0&&(e.style.width=b+"px",e.style.height=F+"px"),w!==null&&w.setSize(e.width,e.height),this.setViewport(0,0,b,F)},this.getDrawingBufferSize=function(b){return b.set(K*nt,at*nt).floor()},this.setDrawingBufferSize=function(b,F,q){K=b,at=F,nt=q,e.width=Math.floor(b*q),e.height=Math.floor(F*q),this.setViewport(0,0,b,F)},this.setEffects=function(b){if(v===Be){zt("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(b){for(let F=0;F<b.length;F++)if(b[F].isOutputPass===!0){Ft("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}w.setEffects(b||[])},this.getCurrentViewport=function(b){return b.copy(st)},this.getViewport=function(b){return b.copy(Et)},this.setViewport=function(b,F,q,V){b.isVector4?Et.set(b.x,b.y,b.z,b.w):Et.set(b,F,q,V),_.viewport(st.copy(Et).multiplyScalar(nt).round())},this.getScissor=function(b){return b.copy(ie)},this.setScissor=function(b,F,q,V){b.isVector4?ie.set(b.x,b.y,b.z,b.w):ie.set(b,F,q,V),_.scissor(xt.copy(ie).multiplyScalar(nt).round())},this.getScissorTest=function(){return Zt},this.setScissorTest=function(b){_.setScissorTest(Zt=b)},this.setOpaqueSort=function(b){Ot=b},this.setTransparentSort=function(b){kt=b},this.getClearColor=function(b){return b.copy(Xt.getClearColor())},this.setClearColor=function(){Xt.setClearColor(...arguments)},this.getClearAlpha=function(){return Xt.getClearAlpha()},this.setClearAlpha=function(){Xt.setClearAlpha(...arguments)},this.clear=function(b=!0,F=!0,q=!0){let V=0;if(b){let G=!1;if(Z!==null){let gt=Z.texture.format;G=m.has(gt)}if(G){let gt=Z.texture.type,Mt=p.has(gt),mt=Xt.getClearColor(),Tt=Xt.getClearAlpha(),It=mt.r,qt=mt.g,Jt=mt.b;Mt?(E[0]=It,E[1]=qt,E[2]=Jt,E[3]=Tt,P.clearBufferuiv(P.COLOR,0,E)):(C[0]=It,C[1]=qt,C[2]=Jt,C[3]=Tt,P.clearBufferiv(P.COLOR,0,C))}else V|=P.COLOR_BUFFER_BIT}F&&(V|=P.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),q&&(V|=P.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),V!==0&&P.clear(V)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(b){b.setRenderer(this),D=b},this.dispose=function(){e.removeEventListener("webglcontextlost",me,!1),e.removeEventListener("webglcontextrestored",le,!1),e.removeEventListener("webglcontextcreationerror",cn,!1),Xt.dispose(),ft.dispose(),ut.dispose(),H.dispose(),it.dispose(),Q.dispose(),_t.dispose(),et.dispose(),ht.dispose(),wt.dispose(),wt.removeEventListener("sessionstart",vl),wt.removeEventListener("sessionend",yl),ei.stop()};function me(b){b.preventDefault(),qa("WebGLRenderer: Context Lost."),I=!0}function le(){qa("WebGLRenderer: Context Restored."),I=!1;let b=B.autoReset,F=Bt.enabled,q=Bt.autoUpdate,V=Bt.needsUpdate,G=Bt.type;Ct(),B.autoReset=b,Bt.enabled=F,Bt.autoUpdate=q,Bt.needsUpdate=V,Bt.type=G}function cn(b){zt("WebGLRenderer: A WebGL context could not be created. Reason: ",b.statusMessage)}function hn(b){let F=b.target;F.removeEventListener("dispose",hn),wh(F)}function wh(b){Th(b),H.remove(b)}function Th(b){let F=H.get(b).programs;F!==void 0&&(F.forEach(function(q){ht.releaseProgram(q)}),b.isShaderMaterial&&ht.releaseShaderCache(b))}this.renderBufferDirect=function(b,F,q,V,G,gt){F===null&&(F=Pt);let Mt=G.isMesh&&G.matrixWorld.determinantAffine()<0,mt=Rh(b,F,q,V,G);_.setMaterial(V,Mt);let Tt=q.index,It=1;if(V.wireframe===!0){if(Tt=$.getWireframeAttribute(q),Tt===void 0)return;It=2}let qt=q.drawRange,Jt=q.attributes.position,Lt=qt.start*It,se=(qt.start+qt.count)*It;gt!==null&&(Lt=Math.max(Lt,gt.start*It),se=Math.min(se,(gt.start+gt.count)*It)),Tt!==null?(Lt=Math.max(Lt,0),se=Math.min(se,Tt.count)):Jt!=null&&(Lt=Math.max(Lt,0),se=Math.min(se,Jt.count));let xe=se-Lt;if(xe<0||xe===1/0)return;_t.setup(G,V,mt,q,Tt);let ge,oe=lt;if(Tt!==null&&(ge=ct.get(Tt),oe=j,oe.setIndex(ge)),G.isMesh)V.wireframe===!0?(_.setLineWidth(V.wireframeLinewidth*Wt()),oe.setMode(P.LINES)):oe.setMode(P.TRIANGLES);else if(G.isLine){let Ae=V.linewidth;Ae===void 0&&(Ae=1),_.setLineWidth(Ae*Wt()),G.isLineSegments?oe.setMode(P.LINES):G.isLineLoop?oe.setMode(P.LINE_LOOP):oe.setMode(P.LINE_STRIP)}else G.isPoints?oe.setMode(P.POINTS):G.isSprite&&oe.setMode(P.TRIANGLES);if(G.isBatchedMesh)if(Vt.get("WEBGL_multi_draw"))oe.renderMultiDraw(G._multiDrawStarts,G._multiDrawCounts,G._multiDrawCount);else{let Ae=G._multiDrawStarts,yt=G._multiDrawCounts,ze=G._multiDrawCount,ee=Tt?ct.get(Tt).bytesPerElement:1,Ze=H.get(V).currentProgram.getUniforms();for(let un=0;un<ze;un++)Ze.setValue(P,"_gl_DrawID",un),oe.render(Ae[un]/ee,yt[un])}else if(G.isInstancedMesh)oe.renderInstances(Lt,xe,G.count);else if(q.isInstancedBufferGeometry){let Ae=q._maxInstanceCount!==void 0?q._maxInstanceCount:1/0,yt=Math.min(q.instanceCount,Ae);oe.renderInstances(Lt,xe,yt)}else oe.render(Lt,xe)};function _l(b,F,q){b.transparent===!0&&b.side===Oe&&b.forceSinglePass===!1?(b.side=Te,b.needsUpdate=!0,Hs(b,F,q),b.side=An,b.needsUpdate=!0,Hs(b,F,q),b.side=Oe):Hs(b,F,q)}this.compile=function(b,F,q=null){q===null&&(q=b),M=ut.get(q),M.init(F),x.push(M),q.traverseVisible(function(G){G.isLight&&G.layers.test(F.layers)&&(M.pushLight(G),G.castShadow&&M.pushShadow(G))}),b!==q&&b.traverseVisible(function(G){G.isLight&&G.layers.test(F.layers)&&(M.pushLight(G),G.castShadow&&M.pushShadow(G))}),M.setupLights();let V=new Set;return b.traverse(function(G){if(!(G.isMesh||G.isPoints||G.isLine||G.isSprite))return;let gt=G.material;if(gt)if(Array.isArray(gt))for(let Mt=0;Mt<gt.length;Mt++){let mt=gt[Mt];_l(mt,q,G),V.add(mt)}else _l(gt,q,G),V.add(gt)}),M=x.pop(),V},this.compileAsync=function(b,F,q=null){let V=this.compile(b,F,q);return new Promise(G=>{function gt(){if(V.forEach(function(Mt){H.get(Mt).currentProgram.isReady()&&V.delete(Mt)}),V.size===0){G(b);return}setTimeout(gt,10)}Vt.get("KHR_parallel_shader_compile")!==null?gt():setTimeout(gt,10)})};let Ho=null;function Ah(b){Ho&&Ho(b)}function vl(){ei.stop()}function yl(){ei.start()}let ei=new ih;ei.setAnimationLoop(Ah),typeof self<"u"&&ei.setContext(self),this.setAnimationLoop=function(b){Ho=b,wt.setAnimationLoop(b),b===null?ei.stop():ei.start()},wt.addEventListener("sessionstart",vl),wt.addEventListener("sessionend",yl),this.render=function(b,F){if(F!==void 0&&F.isCamera!==!0){zt("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(I===!0)return;D!==null&&D.renderStart(b,F);let q=wt.enabled===!0&&wt.isPresenting===!0,V=w!==null&&(Z===null||q)&&w.begin(R,Z);if(b.matrixWorldAutoUpdate===!0&&b.updateMatrixWorld(),F.parent===null&&F.matrixWorldAutoUpdate===!0&&F.updateMatrixWorld(),wt.enabled===!0&&wt.isPresenting===!0&&(w===null||w.isCompositing()===!1)&&(wt.cameraAutoUpdate===!0&&wt.updateCamera(F),F=wt.getCamera()),b.isScene===!0&&b.onBeforeRender(R,b,F,Z),M=ut.get(b,x.length),M.init(F),M.state.textureUnits=Y.getTextureUnits(),x.push(M),bt.multiplyMatrices(F.projectionMatrix,F.matrixWorldInverse),O.setFromProjectionMatrix(bt,sn,F.reversedDepth),ot=this.localClippingEnabled,J=Nt.init(this.clippingPlanes,ot),y=ft.get(b,T.length),y.init(),T.push(y),wt.enabled===!0&&wt.isPresenting===!0){let Mt=R.xr.getDepthSensingMesh();Mt!==null&&Go(Mt,F,-1/0,R.sortObjects)}Go(b,F,0,R.sortObjects),y.finish(),R.sortObjects===!0&&y.sort(Ot,kt,F.reversedDepth),St=wt.enabled===!1||wt.isPresenting===!1||wt.hasDepthSensing()===!1,St&&Xt.addToRenderList(y,b),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),J===!0&&Nt.beginShadows();let G=M.state.shadowsArray;if(Bt.render(G,b,F),J===!0&&Nt.endShadows(),(V&&w.hasRenderPass())===!1){let Mt=y.opaque,mt=y.transmissive;if(M.setupLights(),F.isArrayCamera){let Tt=F.cameras;if(mt.length>0)for(let It=0,qt=Tt.length;It<qt;It++){let Jt=Tt[It];Ml(Mt,mt,b,Jt)}St&&Xt.render(b);for(let It=0,qt=Tt.length;It<qt;It++){let Jt=Tt[It];bl(y,b,Jt,Jt.viewport)}}else mt.length>0&&Ml(Mt,mt,b,F),St&&Xt.render(b),bl(y,b,F)}Z!==null&&z===0&&(Y.updateMultisampleRenderTarget(Z),Y.updateRenderTargetMipmap(Z)),V&&w.end(R),b.isScene===!0&&b.onAfterRender(R,b,F),_t.resetDefaultState(),tt=-1,rt=null,x.pop(),x.length>0?(M=x[x.length-1],Y.setTextureUnits(M.state.textureUnits),J===!0&&Nt.setGlobalState(R.clippingPlanes,M.state.camera)):M=null,T.pop(),T.length>0?y=T[T.length-1]:y=null,D!==null&&D.renderEnd()};function Go(b,F,q,V){if(b.visible===!1)return;if(b.layers.test(F.layers)){if(b.isGroup)q=b.renderOrder;else if(b.isLOD)b.autoUpdate===!0&&b.update(F);else if(b.isLightProbeGrid)M.pushLightProbeGrid(b);else if(b.isLight)M.pushLight(b),b.castShadow&&M.pushShadow(b);else if(b.isSprite){if(!b.frustumCulled||O.intersectsSprite(b)){V&&vt.setFromMatrixPosition(b.matrixWorld).applyMatrix4(bt);let Mt=Q.update(b),mt=b.material;mt.visible&&y.push(b,Mt,mt,q,vt.z,null)}}else if((b.isMesh||b.isLine||b.isPoints)&&(!b.frustumCulled||O.intersectsObject(b))){let Mt=Q.update(b),mt=b.material;if(V&&(b.boundingSphere!==void 0?(b.boundingSphere===null&&b.computeBoundingSphere(),vt.copy(b.boundingSphere.center)):(Mt.boundingSphere===null&&Mt.computeBoundingSphere(),vt.copy(Mt.boundingSphere.center)),vt.applyMatrix4(b.matrixWorld).applyMatrix4(bt)),Array.isArray(mt)){let Tt=Mt.groups;for(let It=0,qt=Tt.length;It<qt;It++){let Jt=Tt[It],Lt=mt[Jt.materialIndex];Lt&&Lt.visible&&y.push(b,Mt,Lt,q,vt.z,Jt)}}else mt.visible&&y.push(b,Mt,mt,q,vt.z,null)}}let gt=b.children;for(let Mt=0,mt=gt.length;Mt<mt;Mt++)Go(gt[Mt],F,q,V)}function bl(b,F,q,V){let{opaque:G,transmissive:gt,transparent:Mt}=b;M.setupLightsView(q),J===!0&&Nt.setGlobalState(R.clippingPlanes,q),V&&_.viewport(st.copy(V)),G.length>0&&Vs(G,F,q),gt.length>0&&Vs(gt,F,q),Mt.length>0&&Vs(Mt,F,q),_.buffers.depth.setTest(!0),_.buffers.depth.setMask(!0),_.buffers.color.setMask(!0),_.setPolygonOffset(!1)}function Ml(b,F,q,V){if((q.isScene===!0?q.overrideMaterial:null)!==null)return;if(M.state.transmissionRenderTarget[V.id]===void 0){let Lt=Vt.has("EXT_color_buffer_half_float")||Vt.has("EXT_color_buffer_float");M.state.transmissionRenderTarget[V.id]=new Xe(1,1,{generateMipmaps:!0,type:Lt?xn:Be,minFilter:Jn,samples:Math.max(4,A.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:jt.workingColorSpace})}let gt=M.state.transmissionRenderTarget[V.id],Mt=V.viewport||st;gt.setSize(Mt.z*R.transmissionResolutionScale,Mt.w*R.transmissionResolutionScale);let mt=R.getRenderTarget(),Tt=R.getActiveCubeFace(),It=R.getActiveMipmapLevel();R.setRenderTarget(gt),R.getClearColor(de),te=R.getClearAlpha(),te<1&&R.setClearColor(16777215,.5),R.clear(),St&&Xt.render(q);let qt=R.toneMapping;R.toneMapping=rn;let Jt=V.viewport;if(V.viewport!==void 0&&(V.viewport=void 0),M.setupLightsView(V),J===!0&&Nt.setGlobalState(R.clippingPlanes,V),Vs(b,q,V),Y.updateMultisampleRenderTarget(gt),Y.updateRenderTargetMipmap(gt),Vt.has("WEBGL_multisampled_render_to_texture")===!1){let Lt=!1;for(let se=0,xe=F.length;se<xe;se++){let ge=F[se],{object:oe,geometry:Ae,material:yt,group:ze}=ge;if(yt.side===Oe&&oe.layers.test(V.layers)){let ee=yt.side;yt.side=Te,yt.needsUpdate=!0,Sl(oe,q,V,Ae,yt,ze),yt.side=ee,yt.needsUpdate=!0,Lt=!0}}Lt===!0&&(Y.updateMultisampleRenderTarget(gt),Y.updateRenderTargetMipmap(gt))}R.setRenderTarget(mt,Tt,It),R.setClearColor(de,te),Jt!==void 0&&(V.viewport=Jt),R.toneMapping=qt}function Vs(b,F,q){let V=F.isScene===!0?F.overrideMaterial:null;for(let G=0,gt=b.length;G<gt;G++){let Mt=b[G],{object:mt,geometry:Tt,group:It}=Mt,qt=Mt.material;qt.allowOverride===!0&&V!==null&&(qt=V),mt.layers.test(q.layers)&&Sl(mt,F,q,Tt,qt,It)}}function Sl(b,F,q,V,G,gt){b.onBeforeRender(R,F,q,V,G,gt),b.modelViewMatrix.multiplyMatrices(q.matrixWorldInverse,b.matrixWorld),b.normalMatrix.getNormalMatrix(b.modelViewMatrix),G.onBeforeRender(R,F,q,V,b,gt),G.transparent===!0&&G.side===Oe&&G.forceSinglePass===!1?(G.side=Te,G.needsUpdate=!0,R.renderBufferDirect(q,F,V,G,b,gt),G.side=An,G.needsUpdate=!0,R.renderBufferDirect(q,F,V,G,b,gt),G.side=Oe):R.renderBufferDirect(q,F,V,G,b,gt),b.onAfterRender(R,F,q,V,G,gt)}function Hs(b,F,q){F.isScene!==!0&&(F=Pt);let V=H.get(b),G=M.state.lights,gt=M.state.shadowsArray,Mt=G.state.version,mt=ht.getParameters(b,G.state,gt,F,q,M.state.lightProbeGridArray),Tt=ht.getProgramCacheKey(mt),It=V.programs;V.environment=b.isMeshStandardMaterial||b.isMeshLambertMaterial||b.isMeshPhongMaterial?F.environment:null,V.fog=F.fog;let qt=b.isMeshStandardMaterial||b.isMeshLambertMaterial&&!b.envMap||b.isMeshPhongMaterial&&!b.envMap;V.envMap=it.get(b.envMap||V.environment,qt),V.envMapRotation=V.environment!==null&&b.envMap===null?F.environmentRotation:b.envMapRotation,It===void 0&&(b.addEventListener("dispose",hn),It=new Map,V.programs=It);let Jt=It.get(Tt);if(Jt!==void 0){if(V.currentProgram===Jt&&V.lightsStateVersion===Mt)return wl(b,mt),Jt}else mt.uniforms=ht.getUniforms(b),D!==null&&b.isNodeMaterial&&D.build(b,q,mt),b.onBeforeCompile(mt,R),Jt=ht.acquireProgram(mt,Tt),It.set(Tt,Jt),V.uniforms=mt.uniforms;let Lt=V.uniforms;return(!b.isShaderMaterial&&!b.isRawShaderMaterial||b.clipping===!0)&&(Lt.clippingPlanes=Nt.uniform),wl(b,mt),V.needsLights=Ph(b),V.lightsStateVersion=Mt,V.needsLights&&(Lt.ambientLightColor.value=G.state.ambient,Lt.lightProbe.value=G.state.probe,Lt.directionalLights.value=G.state.directional,Lt.directionalLightShadows.value=G.state.directionalShadow,Lt.spotLights.value=G.state.spot,Lt.spotLightShadows.value=G.state.spotShadow,Lt.rectAreaLights.value=G.state.rectArea,Lt.ltc_1.value=G.state.rectAreaLTC1,Lt.ltc_2.value=G.state.rectAreaLTC2,Lt.pointLights.value=G.state.point,Lt.pointLightShadows.value=G.state.pointShadow,Lt.hemisphereLights.value=G.state.hemi,Lt.directionalShadowMatrix.value=G.state.directionalShadowMatrix,Lt.spotLightMatrix.value=G.state.spotLightMatrix,Lt.spotLightMap.value=G.state.spotLightMap,Lt.pointShadowMatrix.value=G.state.pointShadowMatrix),V.lightProbeGrid=M.state.lightProbeGridArray.length>0,V.currentProgram=Jt,V.uniformsList=null,Jt}function El(b){if(b.uniformsList===null){let F=b.currentProgram.getUniforms();b.uniformsList=ji.seqWithValue(F.seq,b.uniforms)}return b.uniformsList}function wl(b,F){let q=H.get(b);q.outputColorSpace=F.outputColorSpace,q.batching=F.batching,q.batchingColor=F.batchingColor,q.instancing=F.instancing,q.instancingColor=F.instancingColor,q.instancingMorph=F.instancingMorph,q.skinning=F.skinning,q.morphTargets=F.morphTargets,q.morphNormals=F.morphNormals,q.morphColors=F.morphColors,q.morphTargetsCount=F.morphTargetsCount,q.numClippingPlanes=F.numClippingPlanes,q.numIntersection=F.numClipIntersection,q.vertexAlphas=F.vertexAlphas,q.vertexTangents=F.vertexTangents,q.toneMapping=F.toneMapping}function Ch(b,F){if(b.length===0)return null;if(b.length===1)return b[0].texture!==null?b[0]:null;S.setFromMatrixPosition(F.matrixWorld);for(let q=0,V=b.length;q<V;q++){let G=b[q];if(G.texture!==null&&G.boundingBox.containsPoint(S))return G}return null}function Rh(b,F,q,V,G){F.isScene!==!0&&(F=Pt),Y.resetTextureUnits();let gt=F.fog,Mt=V.isMeshStandardMaterial||V.isMeshLambertMaterial||V.isMeshPhongMaterial?F.environment:null,mt=Z===null?R.outputColorSpace:Z.isXRRenderTarget===!0?Z.texture.colorSpace:jt.workingColorSpace,Tt=V.isMeshStandardMaterial||V.isMeshLambertMaterial&&!V.envMap||V.isMeshPhongMaterial&&!V.envMap,It=it.get(V.envMap||Mt,Tt),qt=V.vertexColors===!0&&!!q.attributes.color&&q.attributes.color.itemSize===4,Jt=!!q.attributes.tangent&&(!!V.normalMap||V.anisotropy>0),Lt=!!q.morphAttributes.position,se=!!q.morphAttributes.normal,xe=!!q.morphAttributes.color,ge=rn;V.toneMapped&&(Z===null||Z.isXRRenderTarget===!0)&&(ge=R.toneMapping);let oe=q.morphAttributes.position||q.morphAttributes.normal||q.morphAttributes.color,Ae=oe!==void 0?oe.length:0,yt=H.get(V),ze=M.state.lights;if(J===!0&&(ot===!0||b!==rt)){let ce=b===rt&&V.id===tt;Nt.setState(V,b,ce)}let ee=!1;V.version===yt.__version?(yt.needsLights&&yt.lightsStateVersion!==ze.state.version||yt.outputColorSpace!==mt||G.isBatchedMesh&&yt.batching===!1||!G.isBatchedMesh&&yt.batching===!0||G.isBatchedMesh&&yt.batchingColor===!0&&G.colorTexture===null||G.isBatchedMesh&&yt.batchingColor===!1&&G.colorTexture!==null||G.isInstancedMesh&&yt.instancing===!1||!G.isInstancedMesh&&yt.instancing===!0||G.isSkinnedMesh&&yt.skinning===!1||!G.isSkinnedMesh&&yt.skinning===!0||G.isInstancedMesh&&yt.instancingColor===!0&&G.instanceColor===null||G.isInstancedMesh&&yt.instancingColor===!1&&G.instanceColor!==null||G.isInstancedMesh&&yt.instancingMorph===!0&&G.morphTexture===null||G.isInstancedMesh&&yt.instancingMorph===!1&&G.morphTexture!==null||yt.envMap!==It||V.fog===!0&&yt.fog!==gt||yt.numClippingPlanes!==void 0&&(yt.numClippingPlanes!==Nt.numPlanes||yt.numIntersection!==Nt.numIntersection)||yt.vertexAlphas!==qt||yt.vertexTangents!==Jt||yt.morphTargets!==Lt||yt.morphNormals!==se||yt.morphColors!==xe||yt.toneMapping!==ge||yt.morphTargetsCount!==Ae||!!yt.lightProbeGrid!=M.state.lightProbeGridArray.length>0)&&(ee=!0):(ee=!0,yt.__version=V.version);let Ze=yt.currentProgram;ee===!0&&(Ze=Hs(V,F,G),D&&V.isNodeMaterial&&D.onUpdateProgram(V,Ze,yt));let un=!1,Dn=!1,xi=!1,ae=Ze.getUniforms(),_e=yt.uniforms;if(_.useProgram(Ze.program)&&(un=!0,Dn=!0,xi=!0),V.id!==tt&&(tt=V.id,Dn=!0),yt.needsLights){let ce=Ch(M.state.lightProbeGridArray,G);yt.lightProbeGrid!==ce&&(yt.lightProbeGrid=ce,Dn=!0)}if(un||rt!==b){_.buffers.depth.getReversed()&&b.reversedDepth!==!0&&(b._reversedDepth=!0,b.updateProjectionMatrix()),ae.setValue(P,"projectionMatrix",b.projectionMatrix),ae.setValue(P,"viewMatrix",b.matrixWorldInverse);let Un=ae.map.cameraPosition;Un!==void 0&&Un.setValue(P,At.setFromMatrixPosition(b.matrixWorld)),A.logarithmicDepthBuffer&&ae.setValue(P,"logDepthBufFC",2/(Math.log(b.far+1)/Math.LN2)),(V.isMeshPhongMaterial||V.isMeshToonMaterial||V.isMeshLambertMaterial||V.isMeshBasicMaterial||V.isMeshStandardMaterial||V.isShaderMaterial)&&ae.setValue(P,"isOrthographic",b.isOrthographicCamera===!0),rt!==b&&(rt=b,Dn=!0,xi=!0)}if(yt.needsLights&&(ze.state.directionalShadowMap.length>0&&ae.setValue(P,"directionalShadowMap",ze.state.directionalShadowMap,Y),ze.state.spotShadowMap.length>0&&ae.setValue(P,"spotShadowMap",ze.state.spotShadowMap,Y),ze.state.pointShadowMap.length>0&&ae.setValue(P,"pointShadowMap",ze.state.pointShadowMap,Y)),G.isSkinnedMesh){ae.setOptional(P,G,"bindMatrix"),ae.setOptional(P,G,"bindMatrixInverse");let ce=G.skeleton;ce&&(ce.boneTexture===null&&ce.computeBoneTexture(),ae.setValue(P,"boneTexture",ce.boneTexture,Y))}G.isBatchedMesh&&(ae.setOptional(P,G,"batchingTexture"),ae.setValue(P,"batchingTexture",G._matricesTexture,Y),ae.setOptional(P,G,"batchingIdTexture"),ae.setValue(P,"batchingIdTexture",G._indirectTexture,Y),ae.setOptional(P,G,"batchingColorTexture"),G._colorsTexture!==null&&ae.setValue(P,"batchingColorTexture",G._colorsTexture,Y));let Nn=q.morphAttributes;if((Nn.position!==void 0||Nn.normal!==void 0||Nn.color!==void 0)&&U.update(G,q,Ze),(Dn||yt.receiveShadow!==G.receiveShadow)&&(yt.receiveShadow=G.receiveShadow,ae.setValue(P,"receiveShadow",G.receiveShadow)),(V.isMeshStandardMaterial||V.isMeshLambertMaterial||V.isMeshPhongMaterial)&&V.envMap===null&&F.environment!==null&&(_e.envMapIntensity.value=F.environmentIntensity),_e.dfgLUT!==void 0&&(_e.dfgLUT.value=pg()),Dn){if(ae.setValue(P,"toneMappingExposure",R.toneMappingExposure),yt.needsLights&&Ih(_e,xi),gt&&V.fog===!0&&Rt.refreshFogUniforms(_e,gt),Rt.refreshMaterialUniforms(_e,V,nt,at,M.state.transmissionRenderTarget[b.id]),yt.needsLights&&yt.lightProbeGrid){let ce=yt.lightProbeGrid;_e.probesSH.value=ce.texture,_e.probesMin.value.copy(ce.boundingBox.min),_e.probesMax.value.copy(ce.boundingBox.max),_e.probesResolution.value.copy(ce.resolution)}ji.upload(P,El(yt),_e,Y)}if(V.isShaderMaterial&&V.uniformsNeedUpdate===!0&&(ji.upload(P,El(yt),_e,Y),V.uniformsNeedUpdate=!1),V.isSpriteMaterial&&ae.setValue(P,"center",G.center),ae.setValue(P,"modelViewMatrix",G.modelViewMatrix),ae.setValue(P,"normalMatrix",G.normalMatrix),ae.setValue(P,"modelMatrix",G.matrixWorld),V.uniformsGroups!==void 0){let ce=V.uniformsGroups;for(let Un=0,_i=ce.length;Un<_i;Un++){let Tl=ce[Un];et.update(Tl,Ze),et.bind(Tl,Ze)}}return Ze}function Ih(b,F){b.ambientLightColor.needsUpdate=F,b.lightProbe.needsUpdate=F,b.directionalLights.needsUpdate=F,b.directionalLightShadows.needsUpdate=F,b.pointLights.needsUpdate=F,b.pointLightShadows.needsUpdate=F,b.spotLights.needsUpdate=F,b.spotLightShadows.needsUpdate=F,b.rectAreaLights.needsUpdate=F,b.hemisphereLights.needsUpdate=F}function Ph(b){return b.isMeshLambertMaterial||b.isMeshToonMaterial||b.isMeshPhongMaterial||b.isMeshStandardMaterial||b.isShadowMaterial||b.isShaderMaterial&&b.lights===!0}this.getActiveCubeFace=function(){return k},this.getActiveMipmapLevel=function(){return z},this.getRenderTarget=function(){return Z},this.setRenderTargetTextures=function(b,F,q){let V=H.get(b);V.__autoAllocateDepthBuffer=b.resolveDepthBuffer===!1,V.__autoAllocateDepthBuffer===!1&&(V.__useRenderToTexture=!1),H.get(b.texture).__webglTexture=F,H.get(b.depthTexture).__webglTexture=V.__autoAllocateDepthBuffer?void 0:q,V.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(b,F){let q=H.get(b);q.__webglFramebuffer=F,q.__useDefaultFramebuffer=F===void 0},this.setRenderTarget=function(b,F=0,q=0){Z=b,k=F,z=q;let V=null,G=!1,gt=!1;if(b){let mt=H.get(b);if(mt.__useDefaultFramebuffer!==void 0){_.bindFramebuffer(P.FRAMEBUFFER,mt.__webglFramebuffer),st.copy(b.viewport),xt.copy(b.scissor),Kt=b.scissorTest,_.viewport(st),_.scissor(xt),_.setScissorTest(Kt),tt=-1;return}else if(mt.__webglFramebuffer===void 0)Y.setupRenderTarget(b);else if(mt.__hasExternalTextures)Y.rebindTextures(b,H.get(b.texture).__webglTexture,H.get(b.depthTexture).__webglTexture);else if(b.depthBuffer){let qt=b.depthTexture;if(mt.__boundDepthTexture!==qt){if(qt!==null&&H.has(qt)&&(b.width!==qt.image.width||b.height!==qt.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");Y.setupDepthRenderbuffer(b)}}let Tt=b.texture;(Tt.isData3DTexture||Tt.isDataArrayTexture||Tt.isCompressedArrayTexture)&&(gt=!0);let It=H.get(b).__webglFramebuffer;b.isWebGLCubeRenderTarget?(Array.isArray(It[F])?V=It[F][q]:V=It[F],G=!0):b.samples>0&&Y.useMultisampledRTT(b)===!1?V=H.get(b).__webglMultisampledFramebuffer:Array.isArray(It)?V=It[q]:V=It,st.copy(b.viewport),xt.copy(b.scissor),Kt=b.scissorTest}else st.copy(Et).multiplyScalar(nt).floor(),xt.copy(ie).multiplyScalar(nt).floor(),Kt=Zt;if(q!==0&&(V=X),_.bindFramebuffer(P.FRAMEBUFFER,V)&&_.drawBuffers(b,V),_.viewport(st),_.scissor(xt),_.setScissorTest(Kt),G){let mt=H.get(b.texture);P.framebufferTexture2D(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_CUBE_MAP_POSITIVE_X+F,mt.__webglTexture,q)}else if(gt){let mt=F;for(let Tt=0;Tt<b.textures.length;Tt++){let It=H.get(b.textures[Tt]);P.framebufferTextureLayer(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0+Tt,It.__webglTexture,q,mt)}}else if(b!==null&&q!==0){let mt=H.get(b.texture);P.framebufferTexture2D(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,mt.__webglTexture,q)}tt=-1},this.readRenderTargetPixels=function(b,F,q,V,G,gt,Mt,mt=0){if(!(b&&b.isWebGLRenderTarget)){zt("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Tt=H.get(b).__webglFramebuffer;if(b.isWebGLCubeRenderTarget&&Mt!==void 0&&(Tt=Tt[Mt]),Tt){_.bindFramebuffer(P.FRAMEBUFFER,Tt);try{let It=b.textures[mt],qt=It.format,Jt=It.type;if(b.textures.length>1&&P.readBuffer(P.COLOR_ATTACHMENT0+mt),!A.textureFormatReadable(qt)){zt("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!A.textureTypeReadable(Jt)){zt("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}F>=0&&F<=b.width-V&&q>=0&&q<=b.height-G&&P.readPixels(F,q,V,G,dt.convert(qt),dt.convert(Jt),gt)}finally{let It=Z!==null?H.get(Z).__webglFramebuffer:null;_.bindFramebuffer(P.FRAMEBUFFER,It)}}},this.readRenderTargetPixelsAsync=async function(b,F,q,V,G,gt,Mt,mt=0){if(!(b&&b.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Tt=H.get(b).__webglFramebuffer;if(b.isWebGLCubeRenderTarget&&Mt!==void 0&&(Tt=Tt[Mt]),Tt)if(F>=0&&F<=b.width-V&&q>=0&&q<=b.height-G){_.bindFramebuffer(P.FRAMEBUFFER,Tt);let It=b.textures[mt],qt=It.format,Jt=It.type;if(b.textures.length>1&&P.readBuffer(P.COLOR_ATTACHMENT0+mt),!A.textureFormatReadable(qt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!A.textureTypeReadable(Jt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let Lt=P.createBuffer();P.bindBuffer(P.PIXEL_PACK_BUFFER,Lt),P.bufferData(P.PIXEL_PACK_BUFFER,gt.byteLength,P.STREAM_READ),P.readPixels(F,q,V,G,dt.convert(qt),dt.convert(Jt),0);let se=Z!==null?H.get(Z).__webglFramebuffer:null;_.bindFramebuffer(P.FRAMEBUFFER,se);let xe=P.fenceSync(P.SYNC_GPU_COMMANDS_COMPLETE,0);return P.flush(),await Ic(P,xe,4),P.bindBuffer(P.PIXEL_PACK_BUFFER,Lt),P.getBufferSubData(P.PIXEL_PACK_BUFFER,0,gt),P.deleteBuffer(Lt),P.deleteSync(xe),gt}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(b,F=null,q=0){let V=Math.pow(2,-q),G=Math.floor(b.image.width*V),gt=Math.floor(b.image.height*V),Mt=F!==null?F.x:0,mt=F!==null?F.y:0;Y.setTexture2D(b,0),P.copyTexSubImage2D(P.TEXTURE_2D,q,0,0,Mt,mt,G,gt),_.unbindTexture()},this.copyTextureToTexture=function(b,F,q=null,V=null,G=0,gt=0){let Mt,mt,Tt,It,qt,Jt,Lt,se,xe,ge=b.isCompressedTexture?b.mipmaps[gt]:b.image;if(q!==null)Mt=q.max.x-q.min.x,mt=q.max.y-q.min.y,Tt=q.isBox3?q.max.z-q.min.z:1,It=q.min.x,qt=q.min.y,Jt=q.isBox3?q.min.z:0;else{let _e=Math.pow(2,-G);Mt=Math.floor(ge.width*_e),mt=Math.floor(ge.height*_e),b.isDataArrayTexture?Tt=ge.depth:b.isData3DTexture?Tt=Math.floor(ge.depth*_e):Tt=1,It=0,qt=0,Jt=0}V!==null?(Lt=V.x,se=V.y,xe=V.z):(Lt=0,se=0,xe=0);let oe=dt.convert(F.format),Ae=dt.convert(F.type),yt;F.isData3DTexture?(Y.setTexture3D(F,0),yt=P.TEXTURE_3D):F.isDataArrayTexture||F.isCompressedArrayTexture?(Y.setTexture2DArray(F,0),yt=P.TEXTURE_2D_ARRAY):(Y.setTexture2D(F,0),yt=P.TEXTURE_2D),_.activeTexture(P.TEXTURE0),_.pixelStorei(P.UNPACK_FLIP_Y_WEBGL,F.flipY),_.pixelStorei(P.UNPACK_PREMULTIPLY_ALPHA_WEBGL,F.premultiplyAlpha),_.pixelStorei(P.UNPACK_ALIGNMENT,F.unpackAlignment);let ze=_.getParameter(P.UNPACK_ROW_LENGTH),ee=_.getParameter(P.UNPACK_IMAGE_HEIGHT),Ze=_.getParameter(P.UNPACK_SKIP_PIXELS),un=_.getParameter(P.UNPACK_SKIP_ROWS),Dn=_.getParameter(P.UNPACK_SKIP_IMAGES);_.pixelStorei(P.UNPACK_ROW_LENGTH,ge.width),_.pixelStorei(P.UNPACK_IMAGE_HEIGHT,ge.height),_.pixelStorei(P.UNPACK_SKIP_PIXELS,It),_.pixelStorei(P.UNPACK_SKIP_ROWS,qt),_.pixelStorei(P.UNPACK_SKIP_IMAGES,Jt);let xi=b.isDataArrayTexture||b.isData3DTexture,ae=F.isDataArrayTexture||F.isData3DTexture;if(b.isDepthTexture){let _e=H.get(b),Nn=H.get(F),ce=H.get(_e.__renderTarget),Un=H.get(Nn.__renderTarget);_.bindFramebuffer(P.READ_FRAMEBUFFER,ce.__webglFramebuffer),_.bindFramebuffer(P.DRAW_FRAMEBUFFER,Un.__webglFramebuffer);for(let _i=0;_i<Tt;_i++)xi&&(P.framebufferTextureLayer(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,H.get(b).__webglTexture,G,Jt+_i),P.framebufferTextureLayer(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,H.get(F).__webglTexture,gt,xe+_i)),P.blitFramebuffer(It,qt,Mt,mt,Lt,se,Mt,mt,P.DEPTH_BUFFER_BIT,P.NEAREST);_.bindFramebuffer(P.READ_FRAMEBUFFER,null),_.bindFramebuffer(P.DRAW_FRAMEBUFFER,null)}else if(G!==0||b.isRenderTargetTexture||H.has(b)){let _e=H.get(b),Nn=H.get(F);_.bindFramebuffer(P.READ_FRAMEBUFFER,W),_.bindFramebuffer(P.DRAW_FRAMEBUFFER,L);for(let ce=0;ce<Tt;ce++)xi?P.framebufferTextureLayer(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,_e.__webglTexture,G,Jt+ce):P.framebufferTexture2D(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,_e.__webglTexture,G),ae?P.framebufferTextureLayer(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,Nn.__webglTexture,gt,xe+ce):P.framebufferTexture2D(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,Nn.__webglTexture,gt),G!==0?P.blitFramebuffer(It,qt,Mt,mt,Lt,se,Mt,mt,P.COLOR_BUFFER_BIT,P.NEAREST):ae?P.copyTexSubImage3D(yt,gt,Lt,se,xe+ce,It,qt,Mt,mt):P.copyTexSubImage2D(yt,gt,Lt,se,It,qt,Mt,mt);_.bindFramebuffer(P.READ_FRAMEBUFFER,null),_.bindFramebuffer(P.DRAW_FRAMEBUFFER,null)}else ae?b.isDataTexture||b.isData3DTexture?P.texSubImage3D(yt,gt,Lt,se,xe,Mt,mt,Tt,oe,Ae,ge.data):F.isCompressedArrayTexture?P.compressedTexSubImage3D(yt,gt,Lt,se,xe,Mt,mt,Tt,oe,ge.data):P.texSubImage3D(yt,gt,Lt,se,xe,Mt,mt,Tt,oe,Ae,ge):b.isDataTexture?P.texSubImage2D(P.TEXTURE_2D,gt,Lt,se,Mt,mt,oe,Ae,ge.data):b.isCompressedTexture?P.compressedTexSubImage2D(P.TEXTURE_2D,gt,Lt,se,ge.width,ge.height,oe,ge.data):P.texSubImage2D(P.TEXTURE_2D,gt,Lt,se,Mt,mt,oe,Ae,ge);_.pixelStorei(P.UNPACK_ROW_LENGTH,ze),_.pixelStorei(P.UNPACK_IMAGE_HEIGHT,ee),_.pixelStorei(P.UNPACK_SKIP_PIXELS,Ze),_.pixelStorei(P.UNPACK_SKIP_ROWS,un),_.pixelStorei(P.UNPACK_SKIP_IMAGES,Dn),gt===0&&F.generateMipmaps&&P.generateMipmap(yt),_.unbindTexture()},this.initRenderTarget=function(b){H.get(b).__webglFramebuffer===void 0&&Y.setupRenderTarget(b)},this.initTexture=function(b){b.isCubeTexture?Y.setTextureCube(b,0):b.isData3DTexture?Y.setTexture3D(b,0):b.isDataArrayTexture||b.isCompressedArrayTexture?Y.setTexture2DArray(b,0):Y.setTexture2D(b,0),_.unbindTexture()},this.resetState=function(){k=0,z=0,Z=null,_.reset(),_t.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return sn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;let e=this.getContext();e.drawingBufferColorSpace=jt._getDrawingBufferColorSpace(t),e.unpackColorSpace=jt._getUnpackColorSpace()}};var gg=1-Math.pow(.001,.0033333333333333335),fl=.6,xg=.25,_g=.25,zo={x:0,y:0,z:0,r:120},pl=class{state=7;next(){return this.state=(this.state*1664525+1013904223)%4294967296,this.state/4294967296}jiggle(){return(this.next()-.5)*1e-6}};function vg(i,t,e){let s=new Float64Array(721),r=t,o=0;for(let h=1;h<=720;h++){let d=h/720*Math.PI*2,u=Math.cos(d)*t,f=Math.sin(d)*e;s[h]=(s[h-1]??0)+Math.hypot(u-r,f-o),r=u,o=f}let a=s[720]??1,l=[],c=0;for(let h=0;h<i;h++){let d=(h/i+.75)%1*a;for(c=0;c<720&&(s[c+1]??a)<d;)c++;l.push(c/720*Math.PI*2)}return l}function pi(i){return 30*Math.sqrt(Math.max(1,i))+34}function ml(i,t,e){let n=[...i.entries()],s=new Map;if(n.length===0)return s;let r=0;if(e!==void 0&&i.has(e)&&n.length>1&&(r=pi(i.get(e)??1),s.set(e,{x:0,y:0,z:0,r}),n=n.filter(([d])=>d!==e)),n.length===1){let d=n[0];if(d){let u=r>0?r+pi(d[1]):0;s.set(d[0],{x:u,y:0,z:0,r:pi(d[1])})}return s}let o=n.length,a=Math.pow(Math.max(.7,Math.min(2.2,t)),.85),c=vg(o,a,1/a).map((d,u)=>({x:Math.cos(d)*a,y:u%2===0?.26:-.26,z:Math.sin(d)/a})),h=0;for(let d=0;d<o;d++)for(let u=d+1;u<o;u++){let f=c[d],g=c[u],v=n[d],m=n[u];if(!f||!g||!v||!m)continue;let p=Math.hypot(f.x-g.x,f.y-g.y,f.z-g.z);p<=0||(h=Math.max(h,(pi(v[1])+pi(m[1]))/p))}return h*=1.18,r>0&&n.forEach(([,d],u)=>{let f=c[u];if(!f)return;let g=Math.hypot(f.x,f.y,f.z);g<=0||(h=Math.max(h,(r+pi(d))*1.12/g))}),n.forEach(([d,u],f)=>{let g=c[f]??{x:0,y:0,z:0};s.set(d,{x:g.x*h,y:g.y*h,z:g.z*h,r:pi(u)})}),s}var yg=Math.PI*(3-Math.sqrt(5));function hh(i){return i.x!==void 0&&i.y!==void 0&&i.z!==void 0}function bg(i,t,e){let n=new Map,s=0;for(let a of i)hh(a)||(n.set(a.group,(n.get(a.group)??0)+1),s+=1);let r=new Map,o=0;return i.map(a=>{if(hh(a))return{id:a.id,group:a.group,radius:a.radius,x:a.x,y:a.y,z:a.z,vx:0,vy:0,vz:0,fx:null,fy:null,fz:null};let l=r.get(a.group)??0;r.set(a.group,l+1);let c=t==="grouped"?l:o++,h=(t==="grouped"?n.get(a.group):s)??1,d=t==="grouped"?e.get(a.group)??zo:zo,u=9*Math.sqrt(c+.5),f=c*yg,g=1-2*(c+.5)/h,v=Math.sqrt(Math.max(0,1-g*g));return{id:a.id,group:a.group,radius:a.radius,x:d.x+u*v*Math.cos(f),y:d.y+u*g,z:d.z+u*v*Math.sin(f),vx:0,vy:0,vz:0,fx:null,fy:null,fz:null}})}function Mg(i,t,e){let n=[],s=new Map;for(let o of i)!t.has(o.source)||!t.has(o.target)||(n.push(o),s.set(o.source,(s.get(o.source)??0)+1),s.set(o.target,(s.get(o.target)??0)+1));let r=[];for(let o of n){let a=t.get(o.source),l=t.get(o.target);if(!a||!l)continue;let c=a.group===l.group,h=e==="grouped"?c?62:190:76,d=e==="grouped"?c?.5:.015:.6,u=s.get(o.source)??0,f=s.get(o.target)??0;r.push({source:a,target:l,distance:h,strength:d,bias:u/(u+f)})}return r}var Bs=class{nodes;nodesById;links;layout;centres;rng=new pl;simAlpha=1;simAlphaTarget=0;constructor(t){this.layout=t.layout,this.centres=t.centres,this.nodes=bg(t.nodes,t.layout,t.centres),this.nodesById=new Map(this.nodes.map(e=>[e.id,e])),this.links=Mg(t.links,this.nodesById,t.layout)}byId(t){return this.nodesById.get(t)}alpha(){return this.simAlpha}reheat(){this.simAlphaTarget=xg,this.simAlpha=Math.max(this.simAlpha,_g)}cool(){this.simAlphaTarget=0}pin(t,e,n,s){let r=this.nodesById.get(t);r&&(r.fx=e,r.fy=n,r.fz=s)}unpin(t){let e=this.nodesById.get(t);e&&(e.fx=null,e.fy=null,e.fz=null)}tick(t=1){for(let e=0;e<t;e++)this.stepOnce()}stepOnce(){this.simAlpha+=(this.simAlphaTarget-this.simAlpha)*gg,this.applyCharge(),this.applyLink(),this.layout==="free"&&this.applyCenterMeanShift(),this.applyPositional(),this.applyCollide();for(let t of this.nodes)t.fx!==null&&t.fy!==null&&t.fz!==null?(t.x=t.fx,t.y=t.fy,t.z=t.fz,t.vx=0,t.vy=0,t.vz=0):(t.vx*=fl,t.vy*=fl,t.vz*=fl,t.x+=t.vx,t.y+=t.vy,t.z+=t.vz)}centreOf(t){return this.centres.get(t)??zo}applyCharge(){let t=this.layout==="grouped"?-165:-150,e=this.layout==="grouped"?300:520,n=e*e,s=this.nodes;for(let r=0;r<s.length;r++){let o=s[r];if(o)for(let a=r+1;a<s.length;a++){let l=s[a];if(!l)continue;let c=l.x-o.x,h=l.y-o.y,d=l.z-o.z,u=c*c+h*h+d*d;if(u===0&&(c=this.rng.jiggle(),h=this.rng.jiggle(),d=this.rng.jiggle(),u=c*c+h*h+d*d),u>=n)continue;u<1&&(u=Math.sqrt(u));let f=t*this.simAlpha/u;o.vx+=c*f,o.vy+=h*f,o.vz+=d*f,l.vx-=c*f,l.vy-=h*f,l.vz-=d*f}}}applyLink(){for(let t of this.links){let{source:e,target:n,distance:s,strength:r,bias:o}=t,a=n.x+n.vx-e.x-e.vx,l=n.y+n.vy-e.y-e.vy,c=n.z+n.vz-e.z-e.vz,h=Math.sqrt(a*a+l*l+c*c);h===0&&(a=this.rng.jiggle(),l=this.rng.jiggle(),c=this.rng.jiggle(),h=Math.sqrt(a*a+l*l+c*c));let d=(h-s)/h*this.simAlpha*r;a*=d,l*=d,c*=d,n.vx-=a*o,n.vy-=l*o,n.vz-=c*o;let u=1-o;e.vx+=a*u,e.vy+=l*u,e.vz+=c*u}}applyCenterMeanShift(){let t=this.nodes,e=t.length;if(e===0)return;let n=0,s=0,r=0;for(let c of t)n+=c.x,s+=c.y,r+=c.z;let o=n/e,a=s/e,l=r/e;for(let c of t)c.x-=o,c.y-=a,c.z-=l}applyPositional(){let t=this.layout==="grouped"?.15:.055;for(let e of this.nodes){let n=this.layout==="grouped"?this.centreOf(e.group):zo;e.vx+=(n.x-e.x)*t*this.simAlpha,e.vy+=(n.y-e.y)*t*this.simAlpha,e.vz+=(n.z-e.z)*t*this.simAlpha}}applyCollide(){let t=this.nodes,e=.9;for(let n=0;n<t.length;n++){let s=t[n];if(!s)continue;let r=s.radius+5,o=r*r,a=s.x+s.vx,l=s.y+s.vy,c=s.z+s.vz;for(let h=n+1;h<t.length;h++){let d=t[h];if(!d)continue;let u=d.radius+5,f=r+u,g=a-(d.x+d.vx),v=l-(d.y+d.vy),m=c-(d.z+d.vz),p=g*g+v*v+m*m;if(p>=f*f)continue;g===0&&(g=this.rng.jiggle(),p+=g*g),v===0&&(v=this.rng.jiggle(),p+=v*v),m===0&&(m=this.rng.jiggle(),p+=m*m),p=Math.sqrt(p);let E=(f-p)/p*e,C=g*E,S=v*E,y=m*E,M=u*u,T=M/(o+M),x=1-T;s.vx+=C*T,s.vy+=S*T,s.vz+=y*T,d.vx-=C*x,d.vy-=S*x,d.vz-=y*x}}}};var Pn="#FAF9F6",Ln="#C28E0E",mi=new Map([["parties",{colour:"#9AA0A8",ink:"#5A616B"}],["unions",{colour:"#E15759",ink:"#A93843"}],["finance",{colour:"#4E79A7",ink:"#365F86"}],["individuals",{colour:"#79706E",ink:"#57504E"}],["property",{colour:"#F28E2B",ink:"#A85A0F"}],["mining & energy",{colour:"#9C755F",ink:"#6E4F3D"}],["hospitality",{colour:"#EDC948",ink:"#7A6414"}],["media & tech",{colour:"#76B7B2",ink:"#3E7A75"}],["health & pharma",{colour:"#59A14F",ink:"#3B7134"}],["gambling",{colour:"#B07AA1",ink:"#7D5273"}],["legal & lobbying",{colour:"#6A51A3",ink:"#4A3775"}],["defence & security",{colour:"#37474F",ink:"#263238"}],["agriculture",{colour:"#6B8E23",ink:"#4A6318"}],["retail",{colour:"#FF9DA7",ink:"#B04A56"}],["tobacco & alcohol",{colour:"#A65628",ink:"#7A3C1B"}],["other",{colour:"#999966",ink:"#6B6B3D"}]]),Sg={colour:"#999966",ink:"#6B6B3D"};function yn(i){return mi.get(i)??Sg}var gi=40,Eg=.22,wg=3.2,uh=380,Tg=520,Ag=230,dh=560,Cg=.22,Rg=48,fh=.35,ph=Math.PI-.55,Ig=68,Pg=86,Lg=420,Dg=560,Ng=2,gl=17,ln=6;function Ug(i){return Math.min(88,15+6.2*Math.sqrt(i))}function Fg(i){return i<.5?4*i*i*i:1-Math.pow(-2*i+2,3)/2}function mh(i){return Math.max(.6,Math.min(5,.55+1.2*Math.log10(1+Math.max(0,i))))}function gh(i){return .2+.28*Math.max(0,Math.min(1,Math.log10(1+Math.max(0,i))/4))}function Og(i){let t=new Map;i.forEach((n,s)=>{let r=n.source<n.target?`${n.source} ${n.target}`:`${n.target} ${n.source}`,o=t.get(r);o?o.push(s):t.set(r,[s])});let e=new Array(i.length).fill(0);for(let n of t.values())n.length!==1&&n.forEach((s,r)=>{e[s]=-1+2*r/(n.length-1)});return e}function xh(){try{let i=document.createElement("canvas");return!!(i.getContext("webgl2")??i.getContext("webgl"))}catch{return!1}}function Bg(){let i=[],t=[];for(let e of mi.values())i.push(new Gt(e.colour)),t.push(e.ink);return{cats:i,inks:t,surface:new Gt(Pn),accent:new Gt(Ln)}}var ko=class{canvas;labelLayer;onSelect;onEdgePick=null;renderer;scene=new fs;camera;nodeGroup=new Ge;edgeGroup=new Ge;territoryGroup=new Ge;hemi;key;fill;fog;sphereGeo=new hi(1,40,24);shellGeo=new hi(1,32,18);tubeGeo=new Hi(1,1,1,7,1,!0);coneGeo=new vs(1,1,10);ringGeo=new Gi(1.18,1.32,48);territoryGeo=new hi(1,28,18);haloGeo=new Gi(1,1.045,64);haloGroup=new Ge;halos=new Map;overlay=null;selectionRing;selectionRingMaterial;traceRing;traceRingMaterial;palette;popup;popupName;popupMeta;popupCounts;popupHint;placedLabelBoxes=[];boxPool=[];discs=[];measureCtx=null;labelFont="";captionFont="";captionSpacing=0;data=null;sim=null;centres=new Map;nodeVisuals=new Map;edgeVisuals=[];flowVisuals=[];territories=[];captionRank=[];hubs=new Map;hubGroup=new Ge;paintRank=[];worldCentre=new N;worldRadius=320;emphasis={selectedId:null,pathEdges:null,pathFrom:null};hoveredId=null;hoveredHub=null;neighbourIds=null;pathNodeIds=null;pathEdgeKeys=null;insets={left:0,right:0,top:0,bottom:0};view;distGoal;tween=null;idleSpin;idleAnchor=-.5;idlePhase=0;reduced;reducedQuery=null;onContextLost=null;onReducedChange=t=>{this.reduced=t.matches,t.matches&&(this.idleSpin=!1)};viewOwnedFlag=!1;focusOwnedFlag=!1;fitDist=420;pointers=new Map;orbit=null;pinch=null;drag=null;gestured=!1;hoverPos=null;hoverDirty=!1;raycaster=new ws;frameHandle=null;lastFrame=performance.now();frameCount=0;renderDirty=!0;paused=!1;resizeObserver;disposed=!1;width=1;height=1;constructor(t,e,n,s){this.canvas=t,this.labelLayer=e,this.onSelect=n,s&&(this.onContextLost=r=>{r.preventDefault(),s()},t.addEventListener("webglcontextlost",this.onContextLost)),this.reducedQuery=typeof globalThis.matchMedia=="function"?globalThis.matchMedia("(prefers-reduced-motion: reduce)"):null,this.reduced=this.reducedQuery?.matches??!1,this.idleSpin=!this.reduced,this.reducedQuery?.addEventListener("change",this.onReducedChange),this.renderer=new Fo({canvas:t,antialias:!0,alpha:!1}),this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,2)),this.popup=document.createElement("div"),this.popup.className="rp-map3d-popup",this.popup.style.display="none",this.popupName=document.createElement("div"),this.popupName.className="rp-map3d-popup-name",this.popupMeta=document.createElement("div"),this.popupMeta.className="rp-map3d-popup-meta",this.popupCounts=document.createElement("div"),this.popupCounts.className="rp-map3d-popup-counts",this.popupHint=document.createElement("div"),this.popupHint.className="rp-map3d-popup-hint",this.popupHint.textContent="Click for details",this.popup.append(this.popupName,this.popupMeta,this.popupCounts,this.popupHint),e.appendChild(this.popup),this.palette=Bg(),this.camera=new Ie(gi,1.5,2,9e3),this.fog=new ds(this.palette.surface.clone(),600,2400),this.scene.fog=this.fog,this.scene.add(this.territoryGroup),this.scene.add(this.edgeGroup),this.scene.add(this.nodeGroup),this.scene.add(this.hubGroup),this.scene.add(this.haloGroup),this.hemi=new Ss(16777215,8947848,.95),this.key=new qi(16777215,1.15),this.key.position.set(.55,1,.4),this.fill=new qi(16777215,.3),this.fill.position.set(-.6,-.35,-.7),this.scene.add(this.hemi,this.key,this.fill),this.selectionRingMaterial=new Ne({transparent:!0,opacity:0,depthWrite:!1,side:Oe}),this.selectionRing=new ue(this.ringGeo,this.selectionRingMaterial),this.selectionRing.visible=!1,this.scene.add(this.selectionRing),this.traceRingMaterial=this.selectionRingMaterial.clone(),this.traceRing=new ue(this.ringGeo,this.traceRingMaterial),this.traceRing.visible=!1,this.scene.add(this.traceRing),this.applyPaletteToScene(),this.view={target:new N,theta:-.5,phi:.95,dist:640},this.distGoal=this.view.dist,this.resizeObserver=new ResizeObserver(()=>this.handleResize()),this.resizeObserver.observe(t.parentElement??t),this.handleResize(),this.bindPointerHandlers(),this.frameHandle=requestAnimationFrame(this.frame)}applyPaletteToScene(){let t=this.palette.surface;this.renderer.setClearColor(t,1),this.fog.color.copy(t),this.hemi.color.copy(t.clone().lerp(new Gt(16777215),.72)),this.hemi.groundColor.copy(t.clone().multiplyScalar(.55)),this.selectionRingMaterial.color.copy(this.palette.accent),this.traceRingMaterial.color.copy(this.palette.accent)}catColour(t){return this.palette.cats[t]??this.palette.accent}applyNodeColour(t){let e=t.colour;t.hollow?(t.material.color.copy(this.palette.surface),t.material.emissive.set(0),t.shellMaterial.color.copy(e)):(t.material.color.copy(e),t.material.emissive.copy(e).multiplyScalar(.16),t.shellMaterial.color.copy(e))}focusKey(){return this.emphasis.selectedId??this.hoveredId??(this.hoveredHub!==null?this.hubs.get(this.hoveredHub)?.id??null:null)}focusColour(t){let e=this.nodeVisuals.get(t);if(e)return e.colour;for(let n of this.hubs.values())if(n.id===t)return n.anchor.colour;return this.palette.accent}applyEdgeColour(t){let e=this.pathEdgeKeys?.has(t.key)??!1,n=this.focusKey(),s=n!==null&&(t.edge.source===n||t.edge.target===n);if(e){t.material.color.copy(this.palette.accent),t.coneMaterial.color.copy(this.palette.accent);return}if(s&&n!==null){let o=this.focusColour(n);t.material.color.copy(o),t.coneMaterial.color.copy(o)}else{let o=t.from.colour;t.material.color.copy(o),t.coneMaterial.color.copy(o)}let r=this.edgeTintOf(t);r>0&&(t.material.color.lerp(this.palette.accent,r),t.coneMaterial.color.lerp(this.palette.accent,r))}edgeTintOf(t){let e=this.overlay?.edgeTint.get(`${t.edge.source}|${t.edge.target}`)??0;return Math.max(0,Math.min(1,e))}setWordsOverlay(t){this.overlay=t,this.syncHalos(),this.updateEmphasisSets()}syncHalos(){let t=this.overlay?.rings;for(let[e,n]of this.halos){let s=t?.get(e)??0;n.presence.target=s>0?1:0,s>0&&(n.value.target=s)}if(t)for(let[e,n]of t){if(n<=0||this.halos.has(e)||!this.nodeVisuals.has(e))continue;let s=new Ne({color:this.palette.accent,transparent:!0,opacity:0,depthWrite:!1,side:Oe}),r=new ue(this.haloGeo,s);r.raycast=()=>{},r.visible=!1,this.haloGroup.add(r),this.halos.set(e,{mesh:r,material:s,presence:{current:0,target:1},value:{current:n,target:n}})}}clearHalos(){for(let t of this.halos.values())t.material.dispose();this.haloGroup.clear(),this.halos.clear()}setData(t){this.data=t;let e=new Map;for(let[h,d]of this.nodeVisuals)e.set(h,{x:d.sim.x,y:d.sim.y,z:d.sim.z});let n=new Map;for(let[h,d]of this.hubs)n.set(h,{lod:d.lod,lodTarget:d.lodTarget,lodFrom:d.lodFrom,lodStarted:d.lodStarted,dived:d.dived});let s=this.nodeVisuals.size===0,r=new Map;for(let h of t.nodes)r.set(h.group,(r.get(h.group)??0)+1);let o=new Map([...r.entries()].sort((h,d)=>d[1]-h[1]||h[0].localeCompare(d[0]))),a=ml(o,t.aspect,t.centralGroup);this.centres=a,!this.viewOwnedFlag&&a.size>2&&(this.view.theta=this.bestTheta(a),this.idleAnchor=this.view.theta,this.idlePhase=0);let l=h=>Xo(t.measure,t.measure==="links"?t.degrees.get(h.id)??0:h.weight);this.sim=new Bs({nodes:t.nodes.map(h=>{let d=e.get(h.id);return{id:h.id,group:h.group,radius:l(h),...d?{x:d.x,y:d.y,z:d.z}:{}}}),links:t.edges.map(h=>({source:h.source,target:h.target})),layout:t.layout,centres:a}),this.sim.tick(300),this.clearScene(),t.nodes.forEach((h,d)=>{let u=this.sim?.byId(h.id);if(!u)return;let f=t.groupStyles.get(h.group),g=f?.slot??0,v=f?.hollow??!1,m=t.degrees.get(h.id)??0,p=t.measure==="links"&&m===0,E=l(h),C=new Wi({roughness:.42,metalness:.04,transparent:!0,opacity:1}),S=new ue(this.sphereGeo,C);S.userData.nodeId=h.id;let y=new Ne({transparent:!0,opacity:v?.95:0,side:Te,depthWrite:!1}),M=new ue(this.shellGeo,y);M.raycast=()=>{},S.add(M),M.scale.setScalar(v?1.22:1.14),this.nodeGroup.add(S);let T=document.createElement("div");T.className="rp-map3d-label",T.textContent=Wo(h.label),T.style.display="none",this.labelLayer.appendChild(T);let x={node:h,sim:u,pos:new N(u.x,u.y,u.z),r:p?Math.max(3.5,E-1.5):E,slot:g,colour:h.colour?new Gt(h.colour):this.catColour(g).clone(),hollow:v,unlinked:p,mesh:S,material:C,shell:M,shellMaterial:y,opacity:{current:1,target:1},shellOpacity:{current:v?.95:0,target:v?.95:0},scale:{current:s&&!this.reduced?.001:1,target:1},lift:{current:0,target:0},degree:m,bornAt:s&&!this.reduced?performance.now()+Math.min(d*9,900):0,label:T,labelW:0,territory:null};this.applyNodeColour(x),this.nodeVisuals.set(h.id,x)});let c=Og(t.edges);if(this.edgeVisuals=[],t.edges.forEach((h,d)=>{let u=this.nodeVisuals.get(h.source),f=this.nodeVisuals.get(h.target);if(!u||!f)return;let g=new Ne({transparent:!0,depthWrite:!1}),v=new ue(this.tubeGeo,g);v.raycast=()=>{};let m=new Ne({transparent:!0,depthWrite:!1}),p=new ue(this.coneGeo,m);p.raycast=()=>{},p.visible=!1,this.edgeGroup.add(v,p);let E=u.node.group!==f.node.group,C={edge:h,key:`${h.source}|${h.label}|${h.target}`,from:u,to:f,mesh:v,material:g,cone:p,coneMaterial:m,width:mh(h.weight),crossing:E,lateral:c[d]??0,opacity:{current:0,target:E?.16:.4},emphasised:!1,label:null,labelW:0,hub:null,aggregate:!1};this.applyEdgeColour(C),this.edgeVisuals.push(C)}),this.territories=[],t.layout==="grouped"&&o.size>1){let h=performance.now(),d=0;for(let[u]of o){let f=t.groupStyles.get(u);if(!f)continue;let g=[],v=0;for(let W of this.nodeVisuals.values())W.node.group===u&&(g.push(W),v+=W.node.total??0);let m=g.length,p=new Ne({transparent:!0,opacity:.055,depthWrite:!1}),E=this.palette.cats[f.slot]??this.palette.accent;p.color.copy(E);let C=new ue(this.territoryGeo,p);C.raycast=()=>{},C.renderOrder=-2,this.territoryGroup.add(C);let S=document.createElement("div");S.className="rp-map3d-territory",S.style.color=this.palette.inks[f.slot]??"#5A616B";let y=`${u.toUpperCase()} \xB7 ${m}`;S.textContent=y,S.style.display="none",this.labelLayer.appendChild(S);let M={group:u,style:f,count:m,total:v,mesh:C,material:p,caption:S,captionFull:y,captionShort:u.toUpperCase(),captionW:0,captionShortW:0,captionHubW:0,captionShortHubW:0,centre:new N,r:0,spread:0,hub:null};for(let W of g)W.territory=M;if(this.territories.push(M),u===t.centralGroup||m<Ng)continue;let T=new Wi({roughness:.42,metalness:.04,transparent:!0,opacity:0});T.color.copy(E),T.emissive.copy(E).multiplyScalar(.16);let x=new ue(this.sphereGeo,T);x.raycast=()=>{},x.visible=!1;let w=new Ne({color:new Gt(f.ink),transparent:!0,opacity:0,depthWrite:!1,side:Oe}),R=new ue(this.haloGeo,w);R.raycast=()=>{},R.visible=!1,this.hubGroup.add(x,R);let I=n.get(u),D={id:`hub:${u}`,group:u,ink:f.ink,count:m,total:v,members:g,anchor:{node:{id:`hub:${u}`,group:u},pos:M.centre,r:Ug(m),scale:{current:1,target:1},colour:E.clone()},mesh:x,material:T,ring:R,ringMaterial:w,flows:[],lod:I?.lod??0,lodTarget:I?.lodTarget??0,lodFrom:I?.lodFrom??0,lodStarted:I?.lodStarted??-1,dived:I?.dived??!1,opacity:{current:1,target:1},scale:{current:s&&!this.reduced?.001:1,target:1},bornAt:s&&!this.reduced?h+240+Math.min(d*45,600):0};d+=1,M.hub=D,this.hubs.set(u,D);let X=new Map;for(let W of this.edgeVisuals){if(W.from.node.group!==u||W.to.node.group===u)continue;let L=W.edge,k=X.get(L.target)??{total:0,weight:0,donors:0,firstYear:null,lastYear:null};k.total+=L.total??0,k.weight+=L.weight,k.donors+=1,L.firstYear&&(k.firstYear=k.firstYear===null?L.firstYear:Math.min(k.firstYear,L.firstYear)),L.lastYear&&(k.lastYear=k.lastYear===null?L.lastYear:Math.max(k.lastYear,L.lastYear)),X.set(L.target,k)}for(let[W,L]of X){let k=this.nodeVisuals.get(W);if(!k)continue;let z={source:D.id,target:W,label:Ue(L.total),weight:L.weight,total:L.total,count:L.donors,firstYear:L.firstYear,lastYear:L.lastYear,hub:u},Z=new Ne({transparent:!0,depthWrite:!1}),tt=new ue(this.tubeGeo,Z);tt.raycast=()=>{},tt.visible=!1;let rt=new Ne({transparent:!0,depthWrite:!1}),st=new ue(this.coneGeo,rt);st.raycast=()=>{},st.visible=!1,this.edgeGroup.add(tt,st);let xt={edge:z,key:`${z.source}|${z.label}|${z.target}`,from:D.anchor,to:k,mesh:tt,material:Z,cone:st,coneMaterial:rt,width:mh(L.weight),crossing:!0,lateral:0,opacity:{current:0,target:gh(L.weight)},emphasised:!1,label:null,labelW:0,hub:D,aggregate:!0};this.applyEdgeColour(xt),D.flows.push(xt),this.flowVisuals.push(xt)}}for(let u of this.edgeVisuals){let f=this.nodeVisuals.get(u.edge.source),g=this.nodeVisuals.get(u.edge.target);u.hub=f?.territory?.hub??g?.territory?.hub??null}}this.captionRank=[...this.territories].sort((h,d)=>d.count-h.count),this.paintRank=[...this.nodeVisuals.values()].sort((h,d)=>d.r-h.r),this.measureLabels(),this.updateWorldBounds(),this.updateTerritories(),this.syncHalos(),this.updateEmphasisSets(),this.renderDirty=!0}measureLabels(){this.measureCtx||(this.measureCtx=document.createElement("canvas").getContext("2d"));let t=this.measureCtx,e=c=>{if(!c)return{font:"",spacing:0};let h=getComputedStyle(c),d=parseFloat(h.letterSpacing);return{font:`${h.fontWeight} ${h.fontSize} ${h.fontFamily}`,spacing:Number.isFinite(d)?d:0}},n=this.paintRank[0],s=e(n?.label),r=this.territories[0]?.caption,o=e(r);r?.setAttribute("data-hub","");let a=e(r);r?.removeAttribute("data-hub"),this.labelFont=s.font,this.captionFont=o.font,this.captionSpacing=o.spacing;let l=(c,h,d,u)=>!t||!h?c.length*u:(t.font=h,t.measureText(c).width+d*c.length);for(let c of this.paintRank)c.labelW=l(c.label.textContent??"",this.labelFont,0,6.2);for(let c of this.territories)c.captionW=l(c.captionFull,this.captionFont,this.captionSpacing,7.4),c.captionShortW=l(c.captionShort,this.captionFont,this.captionSpacing,7.4),c.captionHubW=l(c.captionFull,a.font,a.spacing,8.2),c.captionShortHubW=l(c.captionShort,a.font,a.spacing,8.2)}clearScene(){this.clearHalos();for(let t of this.nodeVisuals.values())t.material.dispose(),t.shellMaterial.dispose(),t.label.remove();for(let t of this.edgeVisuals)t.material.dispose(),t.coneMaterial.dispose(),t.label?.remove();for(let t of this.flowVisuals)t.material.dispose(),t.coneMaterial.dispose(),t.label?.remove();for(let t of this.hubs.values())t.material.dispose(),t.ringMaterial.dispose();for(let t of this.territories)t.material.dispose(),t.caption.remove();this.nodeGroup.clear(),this.edgeGroup.clear(),this.territoryGroup.clear(),this.hubGroup.clear(),this.nodeVisuals.clear(),this.edgeVisuals=[],this.flowVisuals=[],this.territories=[],this.captionRank=[],this.hubs.clear(),this.hoveredHub=null}updateWorldBounds(){let t=new N,e=0;for(let s of this.nodeVisuals.values())t.x+=s.sim.x,t.y+=s.sim.y,t.z+=s.sim.z,e+=1;if(e===0)return;t.multiplyScalar(1/e);let n=120;for(let s of this.nodeVisuals.values()){let r=Math.hypot(s.sim.x-t.x,s.sim.y-t.y,s.sim.z-t.z)+s.r;r>n&&(n=r)}this.worldCentre.copy(t),this.worldRadius=n}setEmphasis(t){this.emphasis=t,this.updateEmphasisSets()}setHover(t,e){this.hoveredId===t&&this.hoveredHub===e||(this.hoveredId=t,this.hoveredHub=e,this.updatePopup(),this.canvas.style.cursor=t!==null||e!==null?"pointer":"grab",this.updateEmphasisSets())}setHovered(t){this.setHover(t,null)}setHoveredHub(t){this.setHover(null,t)}updateEmphasisSets(){let{selectedId:t,pathEdges:e,pathFrom:n}=this.emphasis,s=this.focusKey();if(s){let a=new Set([s]);for(let l of this.edgeVisuals)l.edge.source===s&&a.add(l.edge.target),l.edge.target===s&&a.add(l.edge.source);for(let l of this.flowVisuals)l.edge.source===s&&a.add(l.edge.target);this.neighbourIds=a}else this.neighbourIds=null;if(e){let a=new Set;for(let l of e)a.add(l.source),a.add(l.target);this.pathNodeIds=a,this.pathEdgeKeys=new Set(e.map(l=>`${l.source}|${l.label}|${l.target}`))}else this.pathNodeIds=null,this.pathEdgeKeys=null;for(let a of this.nodeVisuals.values()){let l=a.node.id,c=l===t,h=l===this.hoveredId,d=l===n,u=this.neighbourIds?.has(l)??!0,f=this.pathNodeIds?.has(l)??!1,g=this.pathNodeIds&&!f||!this.pathNodeIds&&!u,v=c||h||d||f;a.opacity.target=g?.3:a.unlinked&&!v?.6:1,a.shellOpacity.target=a.hollow?g?.2:.95:h&&!c?.4:0,a.scale.target=h&&!c?1.24:c?1.14:v?1.08:1,a.lift.target=h&&!c?1:0}let r=this.pathEdgeKeys,o=a=>{let l=r?.has(a.key)??!1,c=s!==null&&(a.edge.source===s||a.edge.target===s),h=r&&!l||s!==null&&!c&&!r,d=l||c;a.emphasised=d;let u=a.aggregate?gh(a.edge.weight):a.crossing?.16:.4,f=Math.max(u,.16+.6*this.edgeTintOf(a));a.opacity.target=h?.06:d?.92:f,this.applyEdgeColour(a)};for(let a of this.edgeVisuals)o(a);for(let a of this.flowVisuals)o(a);for(let a of this.hubs.values()){let l;if(r){let c=!1;for(let h of a.flows)r.has(h.key)&&(c=!0);l=!c}else if(s!==null&&a.id!==s){let c=!1;for(let h of a.flows)h.edge.target===s&&(c=!0);l=!c}else l=!1;a.opacity.target=l?.3:1,a.scale.target=a.group===this.hoveredHub?1.1:1}this.updatePopup(),this.renderDirty=!0}updatePopup(){let t=this.hoveredId?this.nodeVisuals.get(this.hoveredId):void 0,e=!t&&this.hoveredHub!==null?this.hubs.get(this.hoveredHub):void 0;if(!t&&!e||t&&t.node.id===this.emphasis.selectedId){this.popup.style.display="none";return}this.popupMeta.replaceChildren();let n=document.createElement("span");n.className="rp-map3d-popup-dot";let s=document.createElement("span");if(e){this.popupName.textContent=e.group.charAt(0).toUpperCase()+e.group.slice(1),n.style.background=`#${e.anchor.colour.getHexString()}`,s.textContent="industry cluster",s.style.color=e.ink;let r=e.flows.length;this.popupCounts.textContent=`${Ue(e.total)} \xB7 ${e.count} donors \xB7 ${r===1?"1 party":`${r} parties`}`,this.popupHint.textContent="Click to open the cluster"}else if(t){let r=t.node;this.popupName.textContent=r.label,n.style.background=`#${t.colour.getHexString()}`,s.textContent=r.kind==="party"?"political party":(r.industry??r.group).replace(/_/g," "),s.style.color=this.palette.inks[t.slot]??"#5A616B";let o=t.degree===1?"1":`${t.degree}`,a=r.kind==="party"?t.degree===1?"1 donor shown":`${o} donors shown`:t.degree===1?"1 party":`${o} parties`;this.popupCounts.textContent=r.total!==void 0?`${Ue(r.total)} \xB7 ${a}`:a,this.popupHint.textContent="Click for details"}this.popupMeta.append(n,s),this.labelLayer.appendChild(this.popup),this.popup.style.display="block",this.positionPopup()}positionPopup(){if(this.popup.style.display==="none")return;let t=this.hoveredId?this.nodeVisuals.get(this.hoveredId):void 0,e=!t&&this.hoveredHub!==null?this.hubs.get(this.hoveredHub):void 0,n=t??e?.anchor;if(!n){this.popup.style.display="none";return}if(this.labelVec.copy(n.pos).project(this.camera),this.labelVec.z>1||this.labelVec.z<-1){this.popup.style.display="none";return}let s=(this.labelVec.x*.5+.5)*this.width,r=(-this.labelVec.y*.5+.5)*this.height,o=n.pos.distanceTo(this.camera.position),a=Math.tan(Qn.degToRad(gi/2)),l=t?t.lift.current:0,c=n.r*n.scale.current*(this.height/2)/(o*a)*(1+l*.15),h=this.popup.offsetWidth,d=this.popup.offsetHeight,u=s+c+16;u+h>this.width-8&&(u=s-c-16-h);let f=Math.max(8,Math.min(this.height-d-8,r-d/2));this.popup.style.transform=`translate(${Math.max(8,u).toFixed(1)}px, ${f.toFixed(1)}px)`}setInsets(t){this.insets=t}get viewOwned(){return this.viewOwnedFlag}get focusOwned(){return this.focusOwnedFlag}claimView(){this.tween=null,this.viewOwnedFlag=!0,this.focusOwnedFlag=!1,this.idleSpin=!1}releaseDives(){for(let t of this.hubs.values())t.dived=!1}freeBox(){let t=Math.max(1,this.width-this.insets.left-this.insets.right),e=Math.max(1,this.height-this.insets.top-this.insets.bottom);return{w:t,h:e,cx:this.insets.left+t/2,cy:this.insets.top+e/2}}frameFor(t){let e=this.freeBox(),n=Qn.degToRad(gi/2),s=Math.max(.2,e.h/this.height),r=Math.max(.2,e.w/this.width),o=Math.atan(Math.tan(n)*s*.9),a=Math.atan(Math.tan(n)*this.camera.aspect*r*.9),l=t/Math.tan(Math.min(o,a));return{box:e,dist:l}}worldPerPixel(t){return 2*t*Math.tan(Qn.degToRad(gi/2))/this.height}offsetRight=new N;offsetUp=new N;offsetForward=new N;offsetOut=new N;offsetTarget(t,e){let n=this.freeBox(),s=this.worldPerPixel(e),r=n.cx-this.width/2,o=n.cy-this.height/2;return this.camera.matrixWorld.extractBasis(this.offsetRight,this.offsetUp,this.offsetForward),this.offsetOut.copy(t).addScaledVector(this.offsetRight,-r*s).addScaledVector(this.offsetUp,o*s)}fit(t=!0){if(this.tween=null,this.viewOwnedFlag=!1,this.focusOwnedFlag=!1,this.releaseDives(),this.nodeVisuals.size===0)return;this.updateWorldBounds(),this.updateCamera();let e=this.fitDistance();this.fitDist=e;let s={target:this.offsetTarget(this.fitCentre,e).clone(),theta:this.view.theta,phi:this.view.phi,dist:e};this.moveView(s,t?Tg:0)}bestTheta(t){let e=this.view.phi,n=[...t.values()],s=this.view.theta,r=-1/0;for(let o=0;o<36;o++){let a=o/36*Math.PI*2,l=Math.cos(a),c=-Math.sin(a),h=Math.cos(e),d=1/0;for(let u=0;u<n.length;u++)for(let f=u+1;f<n.length;f++){let g=n[u],v=n[f];if(!g||!v)continue;let m=(g.x-v.x)*l+(g.z-v.z)*c,p=(g.y-v.y)*Math.sin(e)-((g.x-v.x)*-c+(g.z-v.z)*l)*h,E=Math.hypot(m,p)/(g.r+v.r);E<d&&(d=E)}d>r&&(r=d,s=a)}return s}fitCentre=new N;fitMidR=0;fitMidU=0;fitDistance(){let{theta:t,phi:e}=this.view;return this.fitCentre.copy(this.worldCentre),this.fitDistanceAt(t,e,!0),this.fitCentre.addScaledVector(this.fitVecRight,this.fitMidR).addScaledVector(this.fitVecUp,this.fitMidU),this.fitDistanceAt(t,e,!1)}fitVecE=new N;fitVecRight=new N;fitVecUp=new N;fitVecD=new N;fitDistanceAt(t,e,n){let s=this.fitVecE.set(Math.sin(e)*Math.sin(t),Math.cos(e),Math.sin(e)*Math.cos(t)),r=this.fitVecRight.crossVectors(this.edgeUp,s);r.lengthSq()<.001&&r.set(1,0,0),r.normalize();let o=this.fitVecUp.crossVectors(s,r),a=this.freeBox(),l=Qn.degToRad(gi/2),c=Math.tan(l)*this.camera.aspect*Math.max(.2,a.w/this.width)*.92,h=Math.tan(l)*Math.max(.2,a.h/this.height)*.92,d=2*Math.tan(l)/this.height,u=this.fitCentre,f=this.fitVecD,g=240,v=-1/0,m=-1/0,p=-1/0,E=-1/0;for(let y of this.nodeVisuals.values()){f.set(y.sim.x,y.sim.y,y.sim.z).sub(u);let M=f.dot(s),T=f.dot(r),x=f.dot(o),w=Math.abs(T)+y.r,R=Math.max(x+y.r+26,-x+y.r);if(g=Math.max(g,w/c+M,R/h+M),n){let I=c*M,D=h*M;T+y.r+I>v&&(v=T+y.r+I),-T+y.r+I>m&&(m=-T+y.r+I),x+y.r+26+D>p&&(p=x+y.r+26+D),-x+y.r+D>E&&(E=-x+y.r+D)}}let C=gl+5+ln,S=C*d/h;for(let y of this.territories){f.copy(y.centre).sub(u);let M=f.dot(s),x=(Math.max(y.captionW,y.captionHubW)/2+4+ln)*d/c;x<.9&&(g=Math.max(g,(Math.abs(f.dot(r))/c+M)/(1-x)));let w=f.dot(o)+y.r;S<.9&&w>0&&(g=Math.max(g,(w/h+M)/(1-S)))}if(n){for(let y of this.territories){f.copy(y.centre).sub(u);let M=f.dot(s),T=f.dot(r),x=f.dot(o),w=(Math.max(y.captionW,y.captionHubW)/2+4+ln)*d*g,R=c*M;T+w+R>v&&(v=T+w+R),-T+w+R>m&&(m=-T+w+R);let I=x+y.r+C*d*g+h*M;I>p&&(p=I)}this.fitMidR=Number.isFinite(v)&&Number.isFinite(m)?(v-m)/2:0,this.fitMidU=Number.isFinite(p)&&Number.isFinite(E)?(p-E)/2:0}return g}focusOn(t,e){let n=this.nodeVisuals.get(t);if(!n)return null;this.updateCamera();let s=new N(n.sim.x,n.sim.y,n.sim.z),r=this.freeBox(),o=s.clone().project(this.camera),a=(o.x*.5+.5)*this.width,l=(-o.y*.5+.5)*this.height,c=Math.min(90,r.w*.18),h=Math.min(90,r.h*.18),d=o.z<1&&a>this.insets.left+c&&a<this.insets.left+r.w-c&&l>this.insets.top+h&&l<this.insets.top+r.h-h,u=n.territory?.hub?.lodTarget===1;if(d&&this.insets.bottom<=0&&!u)return null;let f=e;if(f===null){let v=n.r+30,m=0;for(let y of this.edgeVisuals){let M=y.edge.source===t?y.edge.target:y.edge.target===t?y.edge.source:null;if(M===null)continue;let T=this.nodeVisuals.get(M);if(!T)continue;m++;let x=Math.hypot(T.sim.x-n.sim.x,T.sim.y-n.sim.y,T.sim.z-n.sim.z)+T.r;x>v&&(v=x)}let{dist:p}=this.frameFor(v*1.12),E=m>=40,C=E?dh*(1+Math.log10(m/20)):dh,S=Math.max(Ag,Math.min(C,p));f=E?S:Math.min(this.view.dist,S)}f=Math.max(this.minDist(),Math.min(this.maxDist(),f));let g=this.offsetTarget(s,f);return this.moveView({target:g,theta:this.view.theta,phi:this.view.phi,dist:f},uh),this.viewOwnedFlag=!0,this.focusOwnedFlag=!0,this.idleSpin=!1,f}nudgeForInsets(t,e){if(t===0&&e===0)return;let n=this.worldPerPixel(this.view.dist),s=new N,r=new N,o=new N;this.camera.matrixWorld.extractBasis(s,r,o);let a=this.view.target.clone().addScaledVector(s,-t*n).addScaledVector(r,e*n);this.moveView({...this.view,target:a},uh)}zoomBy(t){this.claimView(),this.releaseDives(),this.distGoal=Math.max(this.minDist(),Math.min(this.maxDist(),this.distGoal/t))}minDist(){return Math.max(60,this.fitDist*Eg)}maxDist(){return this.fitDist*wg}moveView(t,e){if(this.reduced||e<=0){this.view={...t,target:t.target.clone()},this.distGoal=t.dist,this.tween=null,this.renderDirty=!0;return}this.tween={from:{...this.view,target:this.view.target.clone()},to:{...t,target:t.target.clone()},started:performance.now(),duration:e},this.distGoal=t.dist}bindPointerHandlers(){let t=this.canvas;t.addEventListener("pointerdown",this.onPointerDown),t.addEventListener("pointermove",this.onPointerMove),t.addEventListener("pointerup",this.onPointerUp),t.addEventListener("pointercancel",this.onPointerUp),t.addEventListener("pointerleave",this.onPointerLeave),t.addEventListener("wheel",this.onWheel,{passive:!1}),t.addEventListener("contextmenu",this.onContextMenu),t.addEventListener("keydown",this.onKeyDown)}unbindPointerHandlers(){let t=this.canvas;t.removeEventListener("pointerdown",this.onPointerDown),t.removeEventListener("pointermove",this.onPointerMove),t.removeEventListener("pointerup",this.onPointerUp),t.removeEventListener("pointercancel",this.onPointerUp),t.removeEventListener("pointerleave",this.onPointerLeave),t.removeEventListener("wheel",this.onWheel),t.removeEventListener("contextmenu",this.onContextMenu),t.removeEventListener("keydown",this.onKeyDown)}localPoint(t){let e=this.canvas.getBoundingClientRect();return{x:t.clientX-e.left,y:t.clientY-e.top}}capturePointer(t){try{this.canvas.setPointerCapture?.(t)}catch{}}releasePointer(t){try{this.canvas.releasePointerCapture?.(t)}catch{}}raycastVec=new N;pickedNode=null;pickedHub=null;pick(t,e){this.updateCamera(),this.raycaster.setFromCamera(new Yt(t/this.width*2-1,-(e/this.height)*2+1),this.camera);let n=this.raycaster.ray.origin,s=this.raycaster.ray.direction,r=this.raycastVec,o=null,a=null,l=1/0,c=(h,d)=>{r.copy(h).sub(n);let u=r.dot(s);if(u<0)return null;let f=r.lengthSq()-u*u;if(f>d*d)return null;let g=u-Math.sqrt(d*d-f);return g<this.camera.near||g>=l?null:g};for(let h of this.nodeVisuals.values()){let d=h.territory?.hub;if(d&&d.lod>=.5)continue;let u=c(h.pos,h.r);u!==null&&(o=h,a=null,l=u)}for(let h of this.hubs.values()){if(h.lod<.5)continue;let d=c(h.anchor.pos,h.anchor.r*h.anchor.scale.current);d!==null&&(a=h,o=null,l=d)}this.pickedNode=o,this.pickedHub=a}raycastNode(t,e){return this.pick(t,e),this.pickedNode}edgeFold(t){let e=t.hub;return e?t.aggregate?e.lod:1-e.lod:1}pickVecA=new N;pickVecB=new N;pickEdge(t,e,n=9){this.updateCamera();let s=null,r=n,o=this.pickVecA,a=this.pickVecB,l=c=>{if(Math.max(c.opacity.current,c.opacity.target)<.05||this.edgeFold(c)<.5||(o.copy(c.from.pos).project(this.camera),a.copy(c.to.pos).project(this.camera),o.z>1&&a.z>1||o.z<-1&&a.z<-1))return;let h=(o.x*.5+.5)*this.width,d=(-o.y*.5+.5)*this.height,u=(a.x*.5+.5)*this.width,f=(-a.y*.5+.5)*this.height,g=u-h,v=f-d,m=g*g+v*v,p=m>0?Math.max(0,Math.min(1,((t-h)*g+(e-d)*v)/m)):0,E=Math.hypot(t-(h+p*g),e-(d+p*v));E<r&&(r=E,s=c)};for(let c of this.edgeVisuals)l(c);for(let c of this.flowVisuals)l(c);return s}onPointerDown=t=>{let e=this.localPoint(t);if(this.pointers.set(t.pointerId,e),this.capturePointer(t.pointerId),this.pointers.size===2){this.orbit=null,this.releaseDrag();let[s,r]=[...this.pointers.entries()];s&&r&&(this.claimView(),this.releaseDives(),this.pinch={a:s[0],b:r[0],gap:Math.hypot(s[1].x-r[1].x,s[1].y-r[1].y),dist:this.view.dist,midX:(s[1].x+r[1].x)/2,midY:(s[1].y+r[1].y)/2});return}if(this.pointers.size>2||this.pinch)return;this.setHovered(null),t.button===0?this.pick(e.x,e.y):(this.pickedNode=null,this.pickedHub=null);let n=this.pickedNode;if(n&&this.sim){let s=new N;this.camera.getWorldDirection(s);let r=new N(n.sim.x,n.sim.y,n.sim.z),o=new Ke().setFromNormalAndCoplanarPoint(s,r);this.drag={id:n.node.id,plane:o,moved:!1,lastX:e.x,lastY:e.y,travel:0},this.idleSpin=!1,this.sim.reheat();return}this.orbit={mode:t.button===2||t.button===1||t.shiftKey?"pan":"orbit",lastX:e.x,lastY:e.y,moved:0,hub:this.pickedHub?this.pickedHub.group:null},this.canvas.style.cursor="grabbing"};onPointerMove=t=>{let e=this.localPoint(t);this.pointers.has(t.pointerId)&&this.pointers.set(t.pointerId,e);let n=this.pinch;if(n){let o=this.pointers.get(n.a),a=this.pointers.get(n.b);if(!o||!a)return;let l=Math.hypot(o.x-a.x,o.y-a.y);if(l>0&&n.gap>0){let d=Math.max(this.minDist(),Math.min(this.maxDist(),n.dist*(n.gap/l)));this.view.dist=d,this.distGoal=d}let c=(o.x+a.x)/2,h=(o.y+a.y)/2;this.panBy(c-n.midX,h-n.midY),n.midX=c,n.midY=h,this.renderDirty=!0;return}let s=this.drag;if(s&&this.sim){if(s.travel+=Math.abs(e.x-s.lastX)+Math.abs(e.y-s.lastY),s.lastX=e.x,s.lastY=e.y,s.travel<=3)return;s.moved=!0,this.raycaster.setFromCamera(new Yt(e.x/this.width*2-1,-(e.y/this.height)*2+1),this.camera);let o=new N;this.raycaster.ray.intersectPlane(s.plane,o)&&this.sim.pin(s.id,o.x,o.y,o.z);return}let r=this.orbit;if(r){let o=e.x-r.lastX,a=e.y-r.lastY;r.moved+=Math.abs(o)+Math.abs(a),r.lastX=e.x,r.lastY=e.y,r.moved>3&&this.claimView(),r.mode==="pan"?this.panBy(o,a):(this.view.theta-=o*.005,this.view.phi=Math.max(fh,Math.min(ph,this.view.phi-a*.005))),this.renderDirty=!0;return}this.hoverPos=e,this.hoverDirty=!0};panBy(t,e){let n=this.worldPerPixel(this.view.dist),s=new N,r=new N,o=new N;this.camera.matrixWorld.extractBasis(s,r,o),this.view.target.addScaledVector(s,-t*n).addScaledVector(r,e*n)}releaseDrag(){let t=this.drag;t&&(this.sim?.unpin(t.id),this.sim?.cool(),this.drag=null)}onPointerUp=t=>{let e=this.localPoint(t);if(this.pointers.delete(t.pointerId),this.releasePointer(t.pointerId),this.pinch){this.pointers.size<2&&(this.pinch=null,this.gestured=!0);return}let n=this.drag;if(n){let r=n.moved;this.releaseDrag(),r||this.onSelect(n.id);return}let s=this.orbit;if(this.orbit=null,this.canvas.style.cursor="grab",s&&s.moved<=3){if(this.gestured){this.gestured=!1;return}if(s.hub!==null){this.diveInto(s.hub);return}let r=this.raycastNode(e.x,e.y);if(r)this.onSelect(r.node.id);else if(this.pickedHub)this.diveInto(this.pickedHub.group);else{let o=this.onEdgePick?this.pickEdge(e.x,e.y):null;o?this.onEdgePick?.(o.edge):this.emphasis.selectedId===null&&this.emphasis.pathEdges===null&&this.view.dist<this.fitDist*.9?this.fit(!0):this.onSelect(null)}}this.gestured=!1};onPointerLeave=()=>{this.hoverPos=null,this.setHovered(null)};onWheel=t=>{t.preventDefault(),this.claimView(),this.releaseDives();let e=t.deltaY<0?1.12:1/1.12;this.distGoal=Math.max(this.minDist(),Math.min(this.maxDist(),this.distGoal/e))};onContextMenu=t=>{t.preventDefault()};centremost(){let t=this.freeBox(),e=1/0,n=this.labelVec;this.pickedNode=null,this.pickedHub=null;let s=r=>{if(n.copy(r).project(this.camera),n.z>1||n.z<-1)return!1;let o=(n.x*.5+.5)*this.width,a=(-n.y*.5+.5)*this.height;if(o<0||o>this.width||a<0||a>this.height)return!1;let l=Math.hypot(o-t.cx,a-t.cy);return l>=e?!1:(e=l,!0)};for(let r of this.nodeVisuals.values()){let o=r.territory?.hub;o&&o.lod>=.5||s(r.pos)&&(this.pickedNode=r,this.pickedHub=null)}for(let r of this.hubs.values())r.lod<.5||s(r.anchor.pos)&&(this.pickedHub=r,this.pickedNode=null)}onKeyDown=t=>{switch(t.key){case"Enter":case" ":{this.centremost(),this.pickedHub?this.diveInto(this.pickedHub.group):this.pickedNode&&this.onSelect(this.pickedNode.node.id);break}case"ArrowLeft":this.claimView(),this.view.theta+=.15;break;case"ArrowRight":this.claimView(),this.view.theta-=.15;break;case"ArrowUp":this.claimView(),this.view.phi=Math.max(fh,this.view.phi-.15);break;case"ArrowDown":this.claimView(),this.view.phi=Math.min(ph,this.view.phi+.15);break;case"+":case"=":this.zoomBy(1.3);break;case"-":this.zoomBy(1/1.3);break;default:return}t.preventDefault(),this.renderDirty=!0};handleResize(){let t=this.canvas.parentElement;if(!t)return;let e=t.getBoundingClientRect();e.width<1||e.height<1||(this.width=e.width,this.height=e.height,this.renderer.setSize(e.width,e.height,!1),this.camera.aspect=e.width/e.height,this.camera.updateProjectionMatrix(),!this.viewOwnedFlag&&this.nodeVisuals.size>0&&this.fit(!1),this.renderDirty=!0)}stepFades(t){let e=this.reduced?1:1-Math.exp(-t/110),n=!1,s=o=>{let a=o.target-o.current;return Math.abs(a)<.004?(o.current=o.target,o.current):(n=!0,o.current+=a*e,o.current)},r=performance.now();for(let o of this.nodeVisuals.values())o.bornAt>0&&r<o.bornAt?n=!0:(o.bornAt=0,s(o.scale)),s(o.opacity),s(o.shellOpacity),s(o.lift);for(let o of this.edgeVisuals)s(o.opacity);for(let o of this.flowVisuals)s(o.opacity);for(let o of this.hubs.values())o.bornAt>0&&r<o.bornAt?n=!0:(o.bornAt=0,s(o.scale)),s(o.opacity);for(let o of this.halos.values())s(o.presence),s(o.value);return n}frame=t=>{if(this.disposed||this.paused)return;this.frameHandle=requestAnimationFrame(this.frame);let e=Math.min(64,t-this.lastFrame);this.lastFrame=t,this.frameCount+=1;let n=this.sim!==null&&(this.sim.alpha()>.02||this.drag!==null);n&&(this.sim?.tick(1),this.renderDirty=!0);let s=this.tween;if(s){let o=Math.min(1,(t-s.started)/s.duration),a=1-Math.pow(1-o,3);this.view.target.lerpVectors(s.from.target,s.to.target,a),this.view.theta=s.from.theta+(s.to.theta-s.from.theta)*a,this.view.phi=s.from.phi+(s.to.phi-s.from.phi)*a,this.view.dist=s.from.dist*Math.pow(s.to.dist/s.from.dist,a),o>=1&&(this.tween=null),this.renderDirty=!0}else{let o=this.distGoal-this.view.dist;if(Math.abs(o)>.5&&(this.view.dist+=o*(this.reduced?1:Math.min(1,e/90)),this.renderDirty=!0),this.idleSpin&&this.nodeVisuals.size>0){if(this.idlePhase+=e/1e3,this.view.theta=this.idleAnchor+Cg*Math.sin(this.idlePhase/Rg*Math.PI*2),!this.viewOwnedFlag){this.updateCamera();let a=this.fitDistance();this.fitDist=a,this.view.dist=a,this.distGoal=a,this.view.target.copy(this.offsetTarget(this.fitCentre,a))}this.renderDirty=!0}}this.stepFades(e)&&(this.renderDirty=!0);let r=this.updateLod(t);r&&(this.renderDirty=!0),(this.hoverDirty||r)&&!this.drag&&!this.orbit&&!this.pinch&&(this.hoverDirty=!1,this.hoverPos&&(this.pick(this.hoverPos.x,this.hoverPos.y),this.setHover(this.pickedNode?this.pickedNode.node.id:null,this.pickedHub?this.pickedHub.group:null))),this.renderDirty&&(this.renderDirty=!1,this.updateCamera(),n&&this.updateTerritories(),this.updateNodeMeshes(),this.updateHubMeshes(),this.updateEdgeMeshes(),this.updateRings(),this.renderer.render(this.scene,this.camera),this.projectLabels(),(n||this.tween||r)&&(this.renderDirty=!0))};updateCamera(){let{target:t,theta:e,phi:n,dist:s}=this.view,r=Math.sin(n);this.camera.position.set(t.x+s*r*Math.sin(e),t.y+s*Math.cos(n),t.z+s*r*Math.cos(e)),this.camera.lookAt(t),this.camera.updateMatrixWorld(),this.fog.near=s+this.worldRadius*.35,this.fog.far=s+this.worldRadius*4.4}nodeLiftDir=new N;updateNodeMeshes(){for(let t of this.nodeVisuals.values()){let e=t.territory?.hub??null,n=e?e.lod:0,s=t.pos;s.set(t.sim.x,t.sim.y,t.sim.z),e&&n>0&&s.lerp(e.anchor.pos,n);let r=1-n,o=Math.max(.001,t.r*t.scale.current*(.55+.45*r));t.mesh.position.copy(s),t.lift.current>.001&&(this.nodeLiftDir.copy(this.camera.position).sub(t.mesh.position).normalize(),t.mesh.position.addScaledVector(this.nodeLiftDir,t.lift.current*(t.r*.6+10))),t.mesh.scale.setScalar(o);let a=t.opacity.current*r*r;t.mesh.visible=a>.005,t.material.opacity=a,t.material.depthWrite=a>.5,t.shellMaterial.opacity=t.shellOpacity.current*r,t.shell.visible=t.shellMaterial.opacity>.01}}updateHubMeshes(){for(let t of this.territories){let e=t.hub;if(!e)continue;let n=e.lod;t.material.opacity=.055*(1-n),t.mesh.visible=n<.98;let s=.55+.45*n,r=e.scale.current*s;if(e.anchor.scale.current=r,n<=.001){e.mesh.visible=!1,e.ring.visible=!1;continue}let o=Math.max(.001,e.anchor.r*r),a=e.opacity.current*n;e.mesh.visible=a>.005,e.mesh.position.copy(e.anchor.pos),e.mesh.scale.setScalar(o),e.material.opacity=a,e.material.depthWrite=a>.5;let l=Math.max(0,(n-.25)/.75);e.ring.visible=l>.01,e.ring.position.copy(e.anchor.pos),e.ring.scale.setScalar(o*1.24),e.ring.quaternion.copy(this.camera.quaternion),e.ringMaterial.opacity=.75*e.opacity.current*l}}edgeUp=new N(0,1,0);edgeTmpDir=new N;edgeTmpSide=new N;edgeTmpMid=new N;edgeTmpQuat=new je;updateEdgeMeshes(){for(let t of this.edgeVisuals)this.layoutEdge(t);for(let t of this.flowVisuals)this.layoutEdge(t)}layoutEdge(t){let e=this.edgeTmpDir,n=this.edgeTmpSide,s=this.edgeTmpMid,{from:r,to:o}=t,a=this.edgeFold(t),l=t.opacity.current*a;e.copy(o.pos).sub(r.pos);let c=e.length();if(c<1||l<=.01){t.mesh.visible=!1,t.cone.visible=!1;return}e.multiplyScalar(1/c);let h=r.r*r.scale.current,d=o.r*o.scale.current,u=t.emphasised?Math.max(4.5,t.width*3.2):0,f=h+1,g=d+u+1,v=Math.max(1,c-f-g);n.set(e.z,0,-e.x),n.lengthSq()<.01&&n.set(1,0,0),n.normalize();let m=t.lateral*Math.min(12,c*.1),p=f+v/2;s.set(r.pos.x+e.x*p+n.x*m,r.pos.y+e.y*p+n.y*m,r.pos.z+e.z*p+n.z*m);let E=t.emphasised?Math.max(t.width,1.5):t.width;if(t.mesh.visible=!0,t.mesh.position.copy(s),t.mesh.quaternion.copy(this.edgeTmpQuat.setFromUnitVectors(this.edgeUp,e)),t.mesh.scale.set(E,v,E),t.material.opacity=l,t.emphasised){t.cone.visible=!0,t.cone.position.set(o.pos.x-e.x*(d+u/2+1),o.pos.y-e.y*(d+u/2+1),o.pos.z-e.z*(d+u/2+1)),t.cone.quaternion.copy(this.edgeTmpQuat);let C=Math.max(2.2,E*2.1);t.cone.scale.set(C,u,C),t.coneMaterial.opacity=Math.min(1,l+.05)}else t.cone.visible=!1}updateTerritories(){for(let t of this.territories){let e=0,n=0,s=0,r=0;for(let a of this.nodeVisuals.values())a.node.group===t.group&&(e+=a.sim.x,n+=a.sim.y,s+=a.sim.z,r+=1);if(r===0){t.mesh.visible=!1,t.caption.style.display="none";continue}e/=r,n/=r,s/=r;let o=0;for(let a of this.nodeVisuals.values()){if(a.node.group!==t.group)continue;let l=Math.hypot(a.sim.x-e,a.sim.y-n,a.sim.z-s)+a.r;l>o&&(o=l)}t.centre.set(e,n,s),t.spread=o,t.r=o+22,t.mesh.visible=!0,t.mesh.position.set(e,n,s),t.mesh.scale.setScalar(t.r)}}setLod(t,e,n){t.lodTarget===e&&t.lodStarted>=0||(t.lodTarget=e,t.lodFrom=t.lod,t.lodStarted=n,this.renderDirty=!0)}goalDist(){return this.tween?this.tween.to.dist:this.distGoal}updateLod(t){if(this.hubs.size===0)return!1;this.updateCamera();let e=Math.tan(Qn.degToRad(gi/2)),n=Math.max(1,this.goalDist()),s=this.pinnedGroups(),r=!1;for(let o of this.territories){let a=o.hub;if(!a)continue;let l=s!==null&&s.has(a.group),c=o.spread*(this.height/2)/(n*e),h=a.lodTarget;if(l||a.lodTarget===1&&c>Pg?h=0:a.lodTarget===0&&c<Ig&&!a.dived&&(h=1),a.lodStarted<0){a.lodTarget=h,a.lod=h,a.lodFrom=h,a.lodStarted=t,this.renderDirty=!0;continue}if(h!==a.lodTarget&&this.setLod(a,h,t),a.lod!==a.lodTarget){if(this.reduced)a.lod=a.lodTarget;else{let d=Math.min(1,(t-a.lodStarted)/Lg);a.lod=a.lodFrom+(a.lodTarget-a.lodFrom)*Fg(d),d>=1&&(a.lod=a.lodTarget)}r=!0}}return r}pinnedGroups(){let{selectedId:t,pathEdges:e,pathFrom:n}=this.emphasis;if(t===null&&e===null&&n===null)return null;let s=new Set,r=o=>{if(o===null)return;let a=this.nodeVisuals.get(o);a&&s.add(a.node.group)};if(r(t),r(n),e)for(let o of e)r(o.source),r(o.target);return s}diveInto(t){let e=this.territories.find(a=>a.group===t),n=e?.hub;if(!e||!n)return;this.updateCamera();let{dist:s}=this.frameFor(e.spread*1.55+40),r=Math.max(this.minDist(),Math.min(this.maxDist(),s)),o=this.offsetTarget(e.centre,r);this.moveView({target:o,theta:this.view.theta,phi:this.view.phi,dist:r},Dg),n.dived=!0,this.setLod(n,0,performance.now()),this.viewOwnedFlag=!0,this.focusOwnedFlag=!0,this.idleSpin=!1,this.setHoveredHub(null)}get folded(){let t=new Map;for(let[e,n]of this.hubs)t.set(e,n.lodTarget===1);return t}updateRings(){let t=(e,n,s)=>{let r=s?this.nodeVisuals.get(s):void 0;if(!r){e.visible=!1;return}e.visible=!0,e.position.copy(r.pos),e.scale.setScalar(r.r*r.scale.current),e.quaternion.copy(this.camera.quaternion),n.opacity=.85};t(this.selectionRing,this.selectionRingMaterial,this.emphasis.selectedId),t(this.traceRing,this.traceRingMaterial,this.emphasis.pathFrom!==this.emphasis.selectedId?this.emphasis.pathFrom:null);for(let[e,n]of this.halos){let s=this.nodeVisuals.get(e),r=n.presence.current;if(!s||r<.01){n.mesh.visible=!1;continue}let o=Math.max(0,Math.min(1,n.value.current));n.mesh.visible=!0,n.mesh.position.copy(s.mesh.position),n.mesh.scale.setScalar(s.r*s.scale.current*(1.42+.5*o)),n.mesh.quaternion.copy(this.camera.quaternion),n.material.opacity=r*(.18+.72*o)*s.opacity.current}}labelVec=new N;probeBox={x1:0,y1:0,x2:0,y2:0};placeBox(t,e,n,s,r=!1){let o=this.placedLabelBoxes;if(!r){for(let l of o)if(t<l.x2&&n>l.x1&&e<l.y2&&s>l.y1)return!1}let a=this.boxPool[o.length];return a?(a.x1=t,a.y1=e,a.x2=n,a.y2=s):(a={x1:t,y1:e,x2:n,y2:s},this.boxPool.push(a)),o.push(a),!0}capText="";capBaseline=0;capX=0;placeCaption(t,e,n,s,r){let o=e/2+4,a=this.insets.left+ln,l=this.width-this.insets.right-ln,c=this.insets.top+ln,h=this.height-this.insets.bottom-ln;if(o*2>l-a)return!1;for(let d=0;d<2;d++)for(let u=0;u<2;u++){let f=u===0?s-r-5-gl:s+r+5,g=f+gl;if(f<c||g>h)continue;let v=n-o,m=n+o;if(v<a||m>l){if(d===0)continue;let p=v<a?a-v:l-m;v+=p,m+=p}if(this.placeBox(v,f,m,g))return this.capText=t,this.capBaseline=g,this.capX=(v+m)/2,!0}return!1}discCount=0;pushDisc(t,e,n,s){let r=this.discs[this.discCount];return r||(r={ok:!1,sx:0,sy:0,camDist:0,screenR:0,opacity:0},this.discs.push(r)),this.discCount+=1,this.labelVec.copy(t).project(this.camera),r.ok=this.labelVec.z<=1&&this.labelVec.z>=-1,r.sx=(this.labelVec.x*.5+.5)*this.width,r.sy=(-this.labelVec.y*.5+.5)*this.height,r.camDist=t.distanceTo(this.camera.position),r.screenR=e*(this.height/2)/(Math.max(1,r.camDist)*s),r.opacity=n,r}projectLabels(){let t=this.camera,e=Math.tan(Qn.degToRad(gi/2)),n=this.focusKey(),{selectedId:s,pathFrom:r}=this.emphasis;this.placedLabelBoxes.length=0,this.discCount=0;for(let f of this.paintRank)this.pushDisc(f.pos,f.r*f.scale.current*(1+f.lift.current*.15),f.material.opacity,e);let o=this.discCount;for(let f of this.hubs.values())f.lod>.5&&this.pushDisc(f.anchor.pos,f.anchor.r*f.anchor.scale.current,f.material.opacity,e);let a=this.discs,l=this.discCount,c=f=>f===n||f===this.hoveredId||f===r||(this.pathNodeIds?.has(f)??!1),h=(f,g,v,m)=>{let p=f.label;p.style.display="block",p.style.transform=`translate(-50%, -100%) translate(${g.toFixed(1)}px, ${v.toFixed(1)}px)`,p.style.opacity=m.toFixed(2)};for(let f=0;f<this.paintRank.length;f++){let g=this.paintRank[f],v=a[f];if(!g||!v)continue;let m=g.node.id;if(!c(m))continue;let p=g.label;if(!v.ok){p.style.display="none";continue}let{sx:E,sy:C,screenR:S}=v,y=g.labelW*(m===s?1.2:1.1)/2+4;this.placeBox(E-y,C-S-25,E+y,C-S-3,!0),h(g,E,C-S-4,1),p.setAttribute("data-emphasised",""),m===s?p.setAttribute("data-selected",""):p.removeAttribute("data-selected")}for(let f of this.captionRank){let g=f.caption,v=f.hub,m=v?v.lod:0;if(this.labelVec.copy(f.centre).project(t),this.labelVec.z>1||this.labelVec.z<-1){g.style.display="none";continue}let p=(this.labelVec.x*.5+.5)*this.width,E=(-this.labelVec.y*.5+.5)*this.height;if(p<-60||p>this.width+60||E<-40||E>this.height+40){g.style.display="none";continue}let C=f.centre.distanceTo(t.position),y=(v?f.r+(v.anchor.r*v.anchor.scale.current*1.3-f.r)*m:f.r)*(this.height/2)/(Math.max(1,C)*e),M=m>.5;if(!this.placeCaption(f.captionFull,M?f.captionHubW:f.captionW,p,E,y)&&!this.placeCaption(f.captionShort,M?f.captionShortHubW:f.captionShortW,p,E,y)){g.style.display="none";continue}g.textContent!==this.capText&&(g.textContent=this.capText),g.style.display="block",g.style.transform=`translate(-50%, -100%) translate(${this.capX.toFixed(1)}px, ${this.capBaseline.toFixed(1)}px)`;let T=M?.95*(.35+.65*(v?v.opacity.current:1)):n?.3:.9;g.style.opacity=T.toFixed(2),M?g.setAttribute("data-hub",""):g.removeAttribute("data-hub")}let d=Math.max(8,Math.min(48,14*(this.fitDist/Math.max(1,this.view.dist)))),u=0;for(let f=0;f<this.paintRank.length;f++){let g=this.paintRank[f],v=a[f];if(!g||!v)continue;let m=g.node.id;if(c(m))continue;let p=g.label;p.removeAttribute("data-emphasised"),p.removeAttribute("data-selected");let E=g.territory?.hub,C=E?E.lod:0,S=this.neighbourIds?.has(m)??!1;if(C>.35||!v.ok||v.opacity<.2||n!==null&&!S||!S&&u>=d){p.style.display="none";continue}let{sx:y,sy:M,camDist:T,screenR:x}=v,w=g.labelW/2+4;if(y-w<this.insets.left+ln||y+w>this.width-this.insets.right-ln||M-x-23<this.insets.top+ln||M-x-3>this.height-this.insets.bottom-ln){p.style.display="none";continue}let R=y,I=M-x-13,D=!1;for(let k=0;k<l;k++){if(k===f)continue;let z=a[k];if(!z||!z.ok||z.opacity<=.2||z.screenR<=13||z.camDist>=T-1)continue;let Z=k>=o?1.15:.92;if(Math.hypot(R-z.sx,I-z.sy)<z.screenR*Z){D=!0;break}}if(D){p.style.display="none";continue}if(!this.placeBox(y-w,M-x-23,y+w,M-x-3)){p.style.display="none";continue}let X=1;S||(X=Math.max(0,Math.min(1,d-u)),u+=1);let W=Math.max(0,Math.min(1,(T-this.fog.near)/Math.max(1,this.fog.far-this.fog.near))),L=Math.max(.35,(1-W*.5)*Math.min(1,g.opacity.current+.1))*X*(1-C/.35);h(g,y,M-x-4,L)}this.positionPopup(),this.projectEdgeLabels()}projectEdgeLabels(){for(let t of this.edgeVisuals)this.projectEdgeLabel(t);for(let t of this.flowVisuals)this.projectEdgeLabel(t)}projectEdgeLabel(t){if(!(t.emphasised&&!!t.edge.label&&this.view.dist<this.fitDist*1.15&&this.edgeFold(t)>.5)){t.label&&(t.label.style.display="none");return}if(!t.label){let o=document.createElement("div");o.className="rp-map3d-edge-label",o.textContent=t.edge.label,this.labelLayer.appendChild(o),t.label=o;let a=getComputedStyle(o),l=this.measureCtx;l?(l.font=`${a.fontWeight} ${a.fontSize} ${a.fontFamily}`,t.labelW=l.measureText(t.edge.label).width+10):t.labelW=t.edge.label.length*5.4+10}if(this.labelVec.copy(t.from.pos).add(t.to.pos).multiplyScalar(.5).project(this.camera),this.labelVec.z>1||this.labelVec.z<-1){t.label.style.display="none";return}let n=(this.labelVec.x*.5+.5)*this.width,s=(-this.labelVec.y*.5+.5)*this.height,r=t.labelW/2+3;if(!this.placeBox(n-r,s-25,n+r,s-3)){t.label.style.display="none";return}t.label.style.display="block",t.label.style.transform=`translate(-50%, -140%) translate(${n.toFixed(1)}px, ${s.toFixed(1)}px)`}setPaused(t){this.disposed||this.paused===t||(this.paused=t,t?(this.frameHandle!==null&&cancelAnimationFrame(this.frameHandle),this.frameHandle=null):(this.lastFrame=performance.now(),this.renderDirty=!0,this.frameHandle=requestAnimationFrame(this.frame)))}dispose(){this.disposed=!0,this.frameHandle!==null&&cancelAnimationFrame(this.frameHandle),this.unbindPointerHandlers(),this.onContextLost&&this.canvas.removeEventListener("webglcontextlost",this.onContextLost),this.reducedQuery?.removeEventListener("change",this.onReducedChange),this.resizeObserver.disconnect(),this.clearScene(),this.popup.remove(),this.sphereGeo.dispose(),this.shellGeo.dispose(),this.tubeGeo.dispose(),this.coneGeo.dispose(),this.ringGeo.dispose(),this.haloGeo.dispose(),this.territoryGeo.dispose(),this.selectionRingMaterial.dispose(),this.traceRingMaterial.dispose(),this.renderer.dispose()}};var zs={gambling:"gambling",finance:"financial-services",mining:"mining-energy",fossil_fuels:"mining-energy",property:"property-construction",media:"media-communications",hospitality:"hospitality-alcohol",alcohol:"hospitality-alcohol",agriculture:"agriculture",unions:"unions-workplace"},xl={gambling:"Gambling","financial-services":"Financial services","mining-energy":"Mining & energy","property-construction":"Property & construction","media-communications":"Media & communications","hospitality-alcohol":"Hospitality & alcohol",agriculture:"Agriculture","unions-workplace":"Unions & workplace"},Vo=i=>(xl[i]??i).toLowerCase().replace(/ & /g," and "),zg=200,kg="/api/matrix",Vg=6e4,ks=null,_h=0;function Hg(){return ks||(Date.now()-_h<Vg?Promise.resolve(null):(ks=fetch(kg).then(i=>i.ok?i.json():null).then(i=>Gg(i)).catch(()=>null).then(i=>(i||(ks=null,_h=Date.now()),i)),ks))}function Gg(i){if(!i||typeof i!="object")return null;let t=i;if(!Array.isArray(t.parties)||!t.cells||typeof t.cells!="object"||!t.totals||typeof t.totals!="object")return null;let e={};for(let[s,r]of Object.entries(t.cells)){if(!r||typeof r!="object")continue;let o={};for(let[a,l]of Object.entries(r))typeof l=="number"&&Number.isFinite(l)&&(o[a]=l);e[s]=o}let n={};for(let[s,r]of Object.entries(t.totals))typeof r=="number"&&Number.isFinite(r)&&(n[s]=r);return{labelled:typeof t.labelled=="number"?t.labelled:0,parties:t.parties.filter(s=>typeof s=="string"),cells:e,totals:n}}function vh(i,t){let e=i.cells[t]??{},n=i.totals[t]??0,s=i.parties.filter(r=>r!=="Other").map(r=>{let o=e[r]??0;return{party:r,count:o,share:n>0?o/n:0}}).filter(r=>r.count>0).sort((r,o)=>o.share-r.share||r.party.localeCompare(o.party,"en"));return{total:n,rows:s}}function yh(i){let t=Math.round(i*100);return t===0&&i>0?"<1%":`${t}%`}var bh="money-map-words-styles",Wg=`
.mm-words { margin-top: 12px; }
.mm-words-lead { margin: 0 0 4px; font-size: 12.5px; line-height: 1.4; color: #4a4942; }
.mm-words-lead a { color: #26251f; font-weight: 600; text-decoration: none; }
.mm-words-lead a:hover { text-decoration: underline; text-decoration-color: var(--bronze, #A0761B); }
.mm-words-lead b { color: #26251f; font-weight: 600; font-variant-numeric: tabular-nums; }
.mm-words-few { color: #8a8578; }
.mm-words-rows { list-style: none; margin: 0; padding: 0; }
.mm-words-row { display: grid; align-items: center; gap: 8px; padding: 4px 6px; margin: 0 -6px;
  border-radius: 7px; font-size: 12.5px; color: #33322e; text-decoration: none; }
.mm-words-row-party { grid-template-columns: 10px minmax(0, 1fr) 64px 38px; }
.mm-words-row-topic { grid-template-columns: minmax(0, 1fr) 48px 38px auto; }
.mm-words-row:hover { background: rgba(0, 0, 0, 0.05); }
.mm-words-row:focus-visible { outline: 2px solid var(--bronze-ink, #8A5A12); outline-offset: -2px; }
.mm-words-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mm-words-track { height: 3px; background: rgba(0, 0, 0, 0.06); border-radius: 2px; overflow: hidden; }
.mm-words-track i { display: block; height: 100%; background: var(--bronze, #A0761B); }
.mm-words-pct { font-weight: 600; font-variant-numeric: tabular-nums; text-align: right;
  white-space: nowrap; }
.mm-words-money { font-size: 11px; color: #8a8578; white-space: nowrap; font-variant-numeric: tabular-nums; }
.mm-words-fine { margin: 6px 0 0; font-size: 11px; line-height: 1.45; color: #8a8578; }
.mm-words-fine a { color: #57503c; text-decoration-color: var(--bronze, #A0761B); }
/* The halo toggle: last chip in the legend, ruled off from the industries. */
.mm-words-toggle { order: 1; margin-top: 4px; padding-top: 7px; border-top: 1px solid #e4e1d8;
  border-radius: 0 0 7px 7px; }
.mm-chip.mm-words-toggle[aria-pressed='true'] { background: var(--bronze-wash, rgba(160, 118, 27, 0.16));
  color: #26251f; }
.mm-words-glyph { width: 10px; height: 10px; border-radius: 50%; flex: none; box-sizing: border-box;
  border: 1.5px solid var(--bronze, #A0761B); }
.mm-words-toggle[aria-pressed='true'] .mm-words-glyph {
  box-shadow: 0 0 0 2px var(--bronze-wash, rgba(160, 118, 27, 0.16)); }
@media (max-width: 720px) {
  /* The legend is a horizontal scroller here: the toggle leads the row so it
     is never hidden past the end of the industries. */
  .mm-words-toggle { order: -1; margin: 0 4px 0 0; padding: 3px 11px 3px 8px; border-top: 0;
    border-right: 1px solid #e4e1d8; border-radius: 7px 0 0 7px; }
}
`;function Xg(){if(document.getElementById(bh))return;let i=document.createElement("style");i.id=bh,i.textContent=Wg,document.head.appendChild(i)}function re(i,t,e){let n=document.createElement(i);return t&&(n.className=t),e.appendChild(n),n}function Mh(i){Xg();let{engine:t,raw:e,routeBase:n}=i,s=new Map(e.nodes.map(y=>[y.id,y])),r=!1,o=null,a=null,l=null,c=null,h=y=>`${n}#/subject/topic/${y}`,d=(y,M)=>{let T=new URLSearchParams;return T.set("q",Vo(y)),T.set("topic",y),M&&T.set("party",M),`${n}#/search?${T.toString()}`},u=y=>s.get(`party:${y}`)?.colour??"#79706E",f=y=>{let M=new Map;for(let w of e.nodes){if(w.kind!=="donor"||w.group!==y)continue;let R=zs[w.industry];R&&M.set(R,(M.get(R)??0)+w.total)}let T=null,x=-1;for(let[w,R]of M)R>x&&(x=R,T=w);return T},g=()=>{let y=a??(o?.kind==="donor"?o:null);return y?zs[y.industry]??null:l?f(l):null},v=()=>{let y=r&&c?g():null;if(!y||!c){t.setWordsOverlay(null);return}let M=vh(c,y).rows.filter(R=>s.has(`party:${R.party}`)),T=M[0]?.share??0,x=new Map;for(let R of M)T>0&&x.set(`party:${R.party}`,R.share/T);let w=new Map;for(let R of e.edges){let I=s.get(R.source);if(!I||zs[I.industry]!==y)continue;let D=x.get(R.target);D&&w.set(`${R.source}|${R.target}`,D)}t.setWordsOverlay({rings:x,edgeTint:w})},m=y=>{if(c){y(c);return}Hg().then(M=>{M&&(c=M,y(M))})};if(i.legend){let y=re("button","mm-chip mm-words-toggle",i.legend);y.type="button",y.setAttribute("aria-pressed","false"),y.title="Ring each party in bronze by its share of the selected industry's debate",re("span","mm-words-glyph",y).setAttribute("aria-hidden","true");let M=re("span","",y);M.textContent="words halo",y.addEventListener("click",()=>{r=!r,y.setAttribute("aria-pressed",String(r)),r?m(v):v()})}let p=(y,M,T,x)=>{let w=re("li","",y),R=re("a","mm-words-row mm-words-row-party",w);R.href=d(x,M.party),R.title=`${M.party}: ${M.count.toLocaleString("en-AU")} labelled ${Vo(x)} speeches so far. Opens the filtered search.`;let I=re("span","mm-dot",R);I.style.background=u(M.party);let D=re("span","mm-words-name",R);D.textContent=M.party;let X=re("span","mm-words-track",R);X.setAttribute("aria-hidden","true");let W=re("i","",X),L=T>0?M.share/T:0;W.style.width=`${Math.max(L*100,1.5)}%`,W.style.opacity=String(.35+.65*L);let k=re("span","mm-words-pct",R);k.textContent=yh(M.share)},E=(y,M,T)=>{let x=zs[M.industry];if(!x)return;let{total:w,rows:R}=vh(T,x);if(w<=0||R.length===0)return;let I=re("div","mm-legend-title",y);I.textContent="In parliament";let D=re("p","mm-words-lead",y),X=re("a","",D);X.href=h(x),X.textContent=xl[x]??x,D.append(": ");let W=re("b","",D);if(W.textContent=w.toLocaleString("en-AU"),D.append(" labelled speeches so far"),w<zg){let tt=re("span","mm-words-few",D);tt.textContent=" \xB7 few labels yet, shares will move"}let L=re("ul","mm-words-rows",y),k=R[0]?.share??0;for(let tt of R)p(L,tt,k,x);let z=re("p","mm-words-fine",y);z.append("Each party's share of the speeches labelled with this topic. ");let Z=re("a","",z);Z.href=h(x),Z.textContent=`All ${Vo(x)} speeches`},C=(y,M,T)=>{let x=M.label;if(!T.parties.includes(x))return;let w=new Map;for(let L of e.edges){if(L.target!==M.id)continue;let k=s.get(L.source),z=k?zs[k.industry]:void 0;z&&w.set(z,(w.get(z)??0)+L.total)}let R=[...w.entries()].map(([L,k])=>{let z=T.totals[L]??0,Z=T.cells[L]?.[x]??0;return{slug:L,dollars:k,count:Z,share:z>0?Z/z:0}}).filter(L=>L.count>0).sort((L,k)=>k.share-L.share||k.dollars-L.dollars).slice(0,5);if(R.length===0)return;let I=re("div","mm-legend-title",y);I.textContent="What they talk about";let D=re("ul","mm-words-rows",y),X=R[0]?.share??0;for(let L of R){let k=re("li","",D),z=re("a","mm-words-row mm-words-row-topic",k);z.href=h(L.slug),z.title=`${x}: ${L.count.toLocaleString("en-AU")} of ${(T.totals[L.slug]??0).toLocaleString("en-AU")} labelled ${Vo(L.slug)} speeches so far; ${Ue(L.dollars)} disclosed from the matching donors. Opens the topic page.`;let Z=re("span","mm-words-name",z);Z.textContent=xl[L.slug]??L.slug;let tt=re("span","mm-words-track",z);tt.setAttribute("aria-hidden","true");let rt=re("i","",tt),st=X>0?L.share/X:0;rt.style.width=`${Math.max(st*100,1.5)}%`,rt.style.opacity=String(.35+.65*st);let xt=re("span","mm-words-pct",z);xt.textContent=yh(L.share);let Kt=re("span","mm-words-money",z);Kt.textContent=Ue(L.dollars)}let W=re("p","mm-words-fine",y);W.textContent=`${x}'s share of each debate's labelled speeches so far, beside what it received from donors in the matching industry. Shown together for comparison, not as cause.`},S=(y,M)=>{let T=document.createElement("div");T.className="mm-words",T.hidden=!0;let x=y.querySelector(".mm-ask");x?y.insertBefore(T,x):y.appendChild(T),m(w=>{T.isConnected&&(M.kind==="donor"?E(T,M,w):C(T,M,w),T.hidden=T.childElementCount===0)})};return{select(y,M){o=y,a=null,y&&S(M,y),r&&m(v)},selectEdge(y){o=null,a=y?s.get(y.source)??null:null,r&&m(v)},isolate(y){l=y,r&&m(v)}}}var Sh=1e4;function ts(i,t){return i?i===t?`${i}`:`${i}\u2013${t}`:""}function qg(i){let t=new Map,e=0;for(let a of mi.keys())t.set(a,e++);let n=new Map;for(let a of i.nodes)n.set(a.group,(n.get(a.group)??0)+1);let s=new Map;for(let[a,l]of n){let c=yn(a);s.set(a,{slot:t.get(a)??t.get("other")??0,colour:c.colour,ink:c.ink,hollow:!1,count:l})}let r=i.nodes.map(a=>({id:a.id,label:a.label,group:a.group,weight:a.total/Sh,kind:a.kind,industry:a.industry,total:a.total,count:a.count,firstYear:a.firstYear,lastYear:a.lastYear,...a.colour?{colour:a.colour}:{}})),o=i.edges.map(a=>({source:a.source,target:a.target,label:Ue(a.total),weight:a.total/Sh,total:a.total,count:a.count,firstYear:a.firstYear,lastYear:a.lastYear}));return{nodes:r,edges:o,groupStyles:s,degrees:Gs(o)}}var Eh="money-map-styles",Yg=`
.mm-root ::-webkit-scrollbar { width: 8px; height: 8px; }
.mm-root ::-webkit-scrollbar-track { background: transparent; }
.mm-root ::-webkit-scrollbar-thumb { background: #cfc9ba; border-radius: 4px; }
.mm-root ::-webkit-scrollbar-thumb:hover { background: #a0761b; }
.mm-root * { scrollbar-width: thin; scrollbar-color: #cfc9ba transparent; }
.mm-root { position: relative; overflow: hidden; background: ${Pn};
  font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #33322e; }
.mm-canvas { display: block; width: 100%; height: 100%; cursor: grab;
  touch-action: none; user-select: none; -webkit-user-select: none; outline-offset: -3px; }
.mm-canvas:focus-visible { outline: 2px solid ${Ln}; }
.mm-labels { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.rp-map3d-label { position: absolute; top: 0; left: 0; white-space: nowrap;
  font-size: 11px; color: #4a4942; will-change: transform;
  text-shadow: 0 0 4px ${Pn}, 0 0 8px ${Pn}; }
.rp-map3d-label[data-emphasised] { font-size: 12px; font-weight: 600; color: #26251f; }
.rp-map3d-label[data-selected] { font-size: 13px; }
.rp-map3d-territory { position: absolute; top: 0; left: 0; white-space: nowrap;
  font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
  text-shadow: 0 0 4px ${Pn}; transition: opacity 160ms; }
/* A folded cluster's caption is its only name on the map: a step larger. */
.rp-map3d-territory[data-hub] { font-size: 11px; letter-spacing: 0.1em; }
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
.mm-chip[aria-pressed='true'] { background: #142a43; color: #ffffff; }
.mm-chip[data-dimmed] { opacity: 0.4; }
.mm-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.mm-card { position: absolute; top: 12px; right: 12px; width: 330px;
  max-width: calc(100% - 24px); max-height: calc(100% - 24px); overflow: auto;
  border: 1px solid #e4e1d8; border-radius: 12px; padding: 14px 16px;
  outline: none; }
.mm-card:focus-visible { outline: 2px solid ${Ln}; }
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
  background: #142a43; color: #ffffff; font-size: 13px; font-weight: 600;
  text-decoration: none; text-align: center; }
.mm-ask:hover { background: #1d3a5c; color: #ffffff; }
.mm-ask-quiet { background: none; color: #33322e !important; border: 1px solid #d5d1c4;
  margin-top: 8px; }
.mm-ask-quiet:hover { background: rgba(0, 0, 0, 0.05); color: #26251f !important; }
.mm-zoom { position: absolute; right: 12px; bottom: 12px; display: flex;
  flex-direction: column; gap: 4px; }
.mm-zoom button { width: 34px; height: 34px; border: 1px solid #e4e1d8;
  border-radius: 9px; background: rgba(250, 249, 246, 0.92); font-size: 16px;
  color: #4a4942; cursor: pointer; }
.mm-zoom button:hover { background: #fff; }
.mm-hint { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
  margin: 0; font-size: 11.5px; color: #8a8578; pointer-events: none;
  white-space: nowrap; }
.mm-find { position: absolute; top: 12px; right: 12px; width: 240px; }
.mm-find input { width: 100%; border: 1px solid #e4e1d8; border-radius: 9px;
  background: rgba(250, 249, 246, 0.92); backdrop-filter: blur(6px);
  font: inherit; font-size: 13px; color: #33322e; padding: 7px 10px; }
.mm-find input:focus-visible { outline: 2px solid ${Ln}; }
.mm-find-list { list-style: none; margin: 4px 0 0; padding: 4px;
  background: rgba(250, 249, 246, 0.96); border: 1px solid #e4e1d8;
  border-radius: 9px; max-height: 260px; overflow: auto; }
.mm-find-list:empty { display: none; }
.mm-find-list button { display: flex; align-items: center; gap: 7px; width: 100%;
  border: 0; background: none; font: inherit; font-size: 12.5px; color: #33322e;
  padding: 5px 8px; border-radius: 6px; cursor: pointer; text-align: left; }
.mm-find-list button:hover, .mm-find-list button:focus-visible { background: rgba(0,0,0,0.06); }
.mm-root[data-mm-chrome='full'] .mm-card { top: 58px; max-height: calc(100% - 70px); }
.mm-scrub { position: absolute; left: 12px; bottom: 12px; width: 250px;
  background: rgba(250, 249, 246, 0.88); backdrop-filter: blur(6px);
  border: 1px solid #e4e1d8; border-radius: 10px; padding: 8px 12px 10px; }
.mm-scrub-label { display: flex; justify-content: space-between; font-size: 11px;
  font-weight: 700; letter-spacing: 0.06em; color: #8a8578; margin-bottom: 2px; }
.mm-scrub-years { font-variant-numeric: tabular-nums; color: #33322e; }
.mm-scrub input[type='range'] { width: 100%; margin: 2px 0; accent-color: ${Ln}; }
/* The same control on a small plate: one row, the window years as its label,
   the two thumbs sharing a single engraved rail. */
.mm-scrub-mini { width: auto; max-width: calc(100% - 24px); padding: 5px 10px;
  display: flex; align-items: center; gap: 9px; }
.mm-scrub-mini .mm-scrub-label { display: block; margin: 0; flex: none; }
.mm-scrub-mini .mm-scrub-years { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; }
.mm-scrub-rail { position: relative; flex: none; width: 116px; height: 16px; }
.mm-scrub-track { position: absolute; left: 7px; right: 7px; top: 50%; height: 2px;
  margin-top: -1px; background: #d9d4c6; border-radius: 1px; }
.mm-scrub-fill { position: absolute; top: 0; bottom: 0; background: ${Ln}; border-radius: 1px; }
/* Only the thumbs take the pointer, so the two stacked inputs do not mask
   each other and a drag that starts off a thumb still reaches the canvas. */
.mm-scrub-mini input[type='range'] { position: absolute; left: 0; top: 0; width: 100%;
  height: 16px; margin: 0; background: none; pointer-events: none;
  -webkit-appearance: none; appearance: none; }
.mm-scrub-mini input[type='range']:focus-visible { outline: 2px solid ${Ln};
  outline-offset: 1px; border-radius: 8px; }
.mm-scrub-mini input[type='range']::-webkit-slider-runnable-track { height: 16px; background: none; }
.mm-scrub-mini input[type='range']::-moz-range-track { height: 16px; background: none; }
.mm-scrub-mini input[type='range']::-webkit-slider-thumb { -webkit-appearance: none;
  pointer-events: auto; width: 12px; height: 12px; margin-top: 2px; border-radius: 50%;
  border: 1px solid #8a6a10; background: ${Pn}; box-sizing: border-box; cursor: ew-resize; }
.mm-scrub-mini input[type='range']::-moz-range-thumb { pointer-events: auto;
  width: 12px; height: 12px; border-radius: 50%; border: 1px solid #8a6a10;
  background: ${Pn}; box-sizing: border-box; cursor: ew-resize; }
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
  .mm-root[data-mm-chrome='full'] .mm-card { top: auto; max-height: 55%; }
  .mm-hint, .mm-find, .mm-scrub { display: none; }
  /* The compact scrub is small enough to keep on a phone; it moves to the
     top left, which mini chrome leaves empty, clear of the card's sheet. */
  .mm-scrub-mini { display: flex; top: 8px; left: 8px; bottom: auto; }
}
`;function $g(){if(document.getElementById(Eh))return;let i=document.createElement("style");i.id=Eh,i.textContent=Yg,document.head.appendChild(i)}function Dt(i,t,e){let n=document.createElement(i);return t&&(n.className=t),e.appendChild(n),n}async function zv(i,t,e={}){$g(),i.classList.add("mm-root");let n=await fetch(t);if(!n.ok)throw new Error(`money map data: HTTP ${n.status} for ${t}`);let s=await n.json();if(!xh()){let O=Dt("div","mm-fallback",i);O.textContent="The 3D money map needs WebGL, which this browser does not offer. The underlying data is available as JSON at "+t;let J=()=>{};return{select:J,isolate:J,fit:J,setPaused:J,destroy:()=>O.remove()}}let r=qg(s),o=new Map(s.nodes.map(O=>[O.id,O])),a=e.chrome??"full";i.dataset.mmChrome=a;let l=location.pathname==="/"?"":"/",c=e.askUrl??(O=>`${l}#/ask?q=${encodeURIComponent(`What has parliament said about ${O}?`)}`),h=2026,d=1998;for(let O of s.edges)O.firstYear&&(h=Math.min(h,O.firstYear)),O.lastYear&&(d=Math.max(d,O.lastYear));let u=h,f=d,g=Dt("canvas","mm-canvas",i);g.tabIndex=0,g.setAttribute("role","application"),g.setAttribute("aria-label","Money map - drag to orbit, pinch or scroll to zoom, click a node for details. With the keyboard: arrows orbit, plus and minus zoom, Enter selects the node nearest the middle, Escape clears the selection.");let v=Dt("div","mm-labels",i);v.setAttribute("aria-hidden","true");let m=a==="full",p=m?Dt("div","mm-legend",i):null;if(p){let O=Dt("div","mm-legend-title",p);O.textContent="Industries \xB7 click to isolate"}let E=Dt("div","mm-card",i);E.tabIndex=-1,E.setAttribute("role","region"),E.setAttribute("aria-label","Details for the selected node"),E.hidden=!0;let C=m?Dt("div","mm-zoom",i):null;if(C){let O=(J,ot,bt)=>{let At=Dt("button","",C);At.type="button",At.textContent=J,At.setAttribute("aria-label",ot),At.title=ot,At.addEventListener("click",bt)};O("+","Zoom in",()=>x.zoomBy(1.3)),O("\u2212","Zoom out",()=>x.zoomBy(1/1.3)),O("\u2922","Fit the whole map to view",()=>x.fit(!0))}let S=m?Dt("p","mm-hint",i):null;if(S){let O=typeof s.meta?.sourceShort=="string"?s.meta.sourceShort:"AEC returns";S.textContent=`Drag to orbit \xB7 scroll to zoom \xB7 click a cluster to open it \xB7 click a node or a flow \xB7 ${O} ${s.meta?.coverage??"1998\u20132026"}`}let y=null,M=null,T=null,x=new ko(g,v,O=>Et(O,{user:!0}),()=>{g.replaceWith(Object.assign(document.createElement("div"),{className:"mm-fallback",textContent:"The 3D view lost its graphics context. Reload the page to restart it."}))});x.onEdgePick=O=>ie(O);let w=Mh({engine:x,raw:s,legend:p,routeBase:l}),R=()=>{let O=i.getBoundingClientRect();if(O.width<1||O.height<1)return 1.5;let J=O.width/O.height;return J<1?.8:J<1.45?1.2:1.9},I="",D=({keepFocus:O=!1}={})=>{let J=u>h||f<d,ot=Ut=>!J||(Ut.firstYear??h)<=f&&(Ut.lastYear??d)>=u,bt=r.edges.filter(ot),At=new Set(bt.map(Ut=>Ut.source)),vt=r.nodes.filter(Ut=>Ut.group==="parties"?!0:T!==null&&Ut.group!==T?!1:!J||At.has(Ut.id)),Pt=new Set(vt.map(Ut=>Ut.id)),St=bt.filter(Ut=>Pt.has(Ut.source)&&Pt.has(Ut.target)),Wt={nodes:vt,edges:St,groupStyles:r.groupStyles,degrees:Gs(St),measure:"resources",layout:"grouped",aspect:R(),centralGroup:"parties"};x.setData(Wt);let P=`${Wt.aspect}|${T??"*"}`;if(P!==I){let Ut=I==="";I=P,x.setInsets(kt()),x.fit(!Ut)}y&&!Pt.has(y)&&Et(null),M&&!St.includes(M)&&ie(null),O&&y&&Pt.has(y)&&(x.setInsets(kt()),x.focusOn(y,null))},X=R(),W=new ResizeObserver(()=>{let O=i.getBoundingClientRect();if(O.width<1||O.height<1)return;x.setInsets(kt());let J=R();J!==X?(X=J,D()):x.viewOwned||x.fit(!1)});W.observe(i);let L=new Map,k=O=>{T=O!==null&&O!=="parties"&&r.groupStyles.has(O)?O:null;for(let[J,ot]of L)ot.setAttribute("aria-pressed",String(J===T)),T!==null&&J!==T?ot.setAttribute("data-dimmed",""):ot.removeAttribute("data-dimmed");D(),w.isolate(T)};if(p){let O=[...mi.keys()].filter(J=>J!=="parties"&&r.groupStyles.has(J));for(let J of O){let ot=Dt("button","mm-chip",p);ot.type="button",ot.setAttribute("aria-pressed","false");let bt=Dt("span","mm-dot",ot);bt.style.background=yn(J).colour;let At=Dt("span","",ot);At.textContent=`${J} \xB7 ${r.groupStyles.get(J)?.count??0}`,ot.addEventListener("click",()=>k(T===J?null:J)),L.set(J,ot)}}let z=m?Dt("div","mm-find",i):null;if(z){let O=Dt("input","",z);O.type="search",O.placeholder="Find a donor or party\u2026",O.setAttribute("aria-label","Find a donor or party by name");let J=Dt("ul","mm-find-list",z),ot=()=>{let bt=O.value.trim().toLowerCase();if(J.replaceChildren(),bt.length<2)return;let At=r.nodes.map(vt=>{let Pt=vt.label.toLowerCase(),St=Pt.indexOf(bt),Wt=St===0?0:Pt.includes(` ${bt}`)?1:St>0?2:-1;return{n:vt,score:Wt,at:St}}).filter(vt=>vt.score>=0).sort((vt,Pt)=>vt.score-Pt.score||vt.n.label.length-Pt.n.label.length).slice(0,8);for(let{n:vt}of At){let Pt=Dt("li","",J),St=Dt("button","",Pt);St.type="button";let Wt=Dt("span","mm-dot",St);Wt.style.background=vt.colour??yn(vt.group).colour;let P=Dt("span","mm-row-name",St);P.textContent=vt.label,St.addEventListener("click",()=>{O.value="",J.replaceChildren(),Et(vt.id,{user:!0})})}};O.addEventListener("input",ot),O.addEventListener("keydown",bt=>{bt.key==="Enter"&&J.querySelector("button")?.click(),bt.key==="Escape"&&(O.value="",J.replaceChildren(),bt.stopPropagation())})}let Z=!m,tt=(e.scrub??m)&&d>h?Dt("div",Z?"mm-scrub mm-scrub-mini":"mm-scrub",i):null;if(tt){i.insertBefore(tt,E);let O=Dt("div","mm-scrub-label",tt);if(!Z){let P=Dt("span","",O);P.textContent="YEARS"}let J=Dt("span","mm-scrub-years",O),ot=Z?Dt("div","mm-scrub-rail",tt):tt,bt=Z?Dt("div","mm-scrub-fill",Dt("div","mm-scrub-track",ot)):null,At=Dt("input","",ot),vt=Dt("input","",ot);for(let[P,Ut]of[[At,"from"],[vt,"to"]])P.type="range",P.min=String(h),P.max=String(d),P.setAttribute("aria-label",`Show flows ${Ut} year`);At.value=String(h),vt.value=String(d);let Pt=()=>{if(J.textContent=u===f?`${u}`:`${u} \u2013 ${f}`,bt){let P=d-h;bt.style.left=`${(u-h)/P*100}%`,bt.style.right=`${(d-f)/P*100}%`}};Pt();let St=0,Wt=()=>{let P=Number(At.value),Ut=Number(vt.value);u=Math.min(P,Ut),f=Math.max(P,Ut),Pt(),!St&&(St=requestAnimationFrame(()=>{St=0,D({keepFocus:!0})}))};At.addEventListener("input",Wt),vt.addEventListener("input",Wt)}let rt=(O,J,ot,bt,At,vt)=>{let Pt=Dt("li","",O),St=Dt("button","mm-row",Pt);if(St.type="button",vt?St.addEventListener("click",vt):St.disabled=!0,J){let Ut=Dt("span","mm-dot",St);Ut.style.background=J}let Wt=Dt("span","mm-row-name",St);Wt.textContent=ot;let P=Dt("span","mm-row-amt",St);if(P.textContent=Ue(bt),At){let Ut=Dt("span","mm-row-years",St);Ut.textContent=At}},st=(O,J,ot,bt=!1,At=!1)=>{let vt=Dt("a",bt?"mm-ask mm-ask-quiet":"mm-ask",O);vt.href=J,vt.textContent=ot,At&&(vt.target="_blank",vt.rel="noopener")},xt=O=>`https://www.google.com/search?q=${encodeURIComponent(`${O} Australia`)}`,Kt=(O,J)=>`${l}#/subject/${O}/${encodeURIComponent(J)}`,de=O=>{let J=new Map;for(let At of s.edges){if(At.target!==O)continue;let vt=o.get(At.source);if(!vt||vt.industry==="other")continue;let Pt=vt.industry.replace(/_/g," ");J.set(Pt,(J.get(Pt)??0)+At.total)}let ot=null,bt=0;for(let[At,vt]of J)vt>bt&&(bt=vt,ot=At);return ot},te=O=>{E.innerHTML="";let J=Dt("button","mm-card-close",E);J.type="button",J.textContent="\u2715",J.setAttribute("aria-label","Close details"),J.addEventListener("click",()=>Et(null,{user:!0}));let ot=Dt("h2","",E);ot.textContent=O.label;let bt=Dt("span","mm-card-tag",E),At=yn(O.group);bt.style.color=O.kind==="party"?O.colour??At.ink:At.ink,bt.textContent=O.kind==="party"?"political party":O.industry.replace(/_/g," ");let vt=Dt("div","mm-card-total",E);vt.textContent=Ue(O.total);let Pt=Dt("div","mm-card-sub",E),St=ts(O.firstYear,O.lastYear);Pt.textContent=O.kind==="party"?`received across ${O.count.toLocaleString()} receipts \xB7 ${St}`:`given across ${O.count.toLocaleString()} donations \xB7 ${St}`;let Wt=Dt("div","mm-legend-title",E),P=Dt("ul","mm-rows",E);if(O.kind==="donor"){Wt.textContent="Where it went";let Ut=s.edges.filter(Vt=>Vt.source===O.id).sort((Vt,A)=>A.total-Vt.total);for(let Vt of Ut){let A=o.get(Vt.target);A&&rt(P,A.colour??"#9AA0A8",A.label,Vt.total,ts(Vt.firstYear,Vt.lastYear),()=>Et(A.id,{user:!0}))}["individual","other",""].includes(O.industry.toLowerCase())||st(E,c(O.industry.replace(/_/g," ")),"What did parliament say about this industry?"),st(E,`${l}#/search?q=${encodeURIComponent(`"${K(O.label)}"`)}`,`What was said about ${K(O.label)}?`,!0),st(E,Kt("donor",O.label),"Full profile",!0),st(E,xt(O.label),"Search the web \u2197",!0,!0)}else{Wt.textContent="Top donors shown on the map";let Ut=s.edges.filter(A=>A.target===O.id).sort((A,_)=>_.total-A.total).slice(0,15);for(let A of Ut){let _=o.get(A.source);_&&rt(P,yn(_.group).colour,_.label,A.total,ts(A.firstYear,A.lastYear),()=>Et(_.id,{user:!0}))}let Vt=de(O.id);Vt&&st(E,`${l}#/ask?q=${encodeURIComponent(`What has ${O.label} said about ${Vt}?`)}`,`Ask what ${O.label} said about ${Vt}`),st(E,Kt("party",O.label),"Full profile",!0),st(E,xt(O.label),"Search the web \u2197",!0,!0)}},K=O=>O.replace(/\s+(Pty\.?\s*)?(Ltd|Limited|Incorporated|Inc)\.?$/i,""),at=(O,J)=>{let ot=o.get(O.target);if(!ot)return;E.innerHTML="";let bt=Dt("button","mm-card-close",E);bt.type="button",bt.textContent="\u2715",bt.setAttribute("aria-label","Close details"),bt.addEventListener("click",()=>ie(null));let At=yn(J),vt=J.charAt(0).toUpperCase()+J.slice(1),Pt=Dt("h2","",E);Pt.textContent=`${vt} \u2192 ${ot.label}`;let St=Dt("span","mm-card-tag",E);St.style.color=At.ink,St.textContent="industry flow";let Wt=Dt("div","mm-card-total",E);Wt.textContent=Ue(O.total??0);let P=Dt("div","mm-card-sub",E),Ut=ts(O.firstYear??null,O.lastYear??null),Vt=O.count??0;P.textContent=`from ${Vt===1?"1 donor":`${Vt.toLocaleString()} donors`} shown${Ut?` \xB7 ${Ut}`:""}`;let A=Dt("div","mm-legend-title",E);A.textContent="Largest donors in this flow";let _=Dt("ul","mm-rows",E),B=s.edges.filter(Y=>Y.target===ot.id&&o.get(Y.source)?.group===J).sort((Y,it)=>it.total-Y.total).slice(0,12);for(let Y of B){let it=o.get(Y.source);it&&rt(_,At.colour,it.label,Y.total,ts(Y.firstYear,Y.lastYear),()=>Et(it.id,{user:!0}))}["individuals","other"].includes(J)||st(E,c(J),`What has parliament said about ${J}?`);let H=Dt("button","mm-ask mm-ask-quiet",E);H.type="button",H.textContent=`Show only ${J} on the map`,H.addEventListener("click",()=>{ie(null),k(J)})},nt=O=>{if(O.hub){at(O,O.hub);return}let J=o.get(O.source),ot=o.get(O.target);if(!J||!ot)return;E.innerHTML="";let bt=Dt("button","mm-card-close",E);bt.type="button",bt.textContent="\u2715",bt.setAttribute("aria-label","Close details"),bt.addEventListener("click",()=>ie(null));let At=Dt("h2","",E);At.textContent=`${J.label} \u2192 ${ot.label}`;let vt=Dt("span","mm-card-tag",E);vt.style.color=yn(J.group).ink,vt.textContent=`${J.industry.replace(/_/g," ")} money`;let Pt=Dt("div","mm-card-total",E);Pt.textContent=Ue(O.total??0);let St=Dt("div","mm-card-sub",E),Wt=ts(O.firstYear??null,O.lastYear??null);St.textContent=`across ${(O.count??0).toLocaleString()} donations${Wt?` \xB7 ${Wt}`:""}`;let P=Dt("ul","mm-rows",E);if(rt(P,J.colour??yn(J.group).colour,J.label,J.total,"",()=>Et(J.id,{user:!0})),rt(P,ot.colour??"#9AA0A8",ot.label,ot.total,"",()=>Et(ot.id,{user:!0})),O.firstYear&&O.lastYear){let Ut=J.industry.replace(/_/g," ");st(E,`${l}#/search?q=${encodeURIComponent(Ut)}&from=${O.firstYear}&to=${O.lastYear}`,`What was said about ${Ut} in ${Wt}?`)}},Ot=()=>{let O={left:0,right:0,top:0,bottom:0},J=i.getBoundingClientRect();if(J.width<1||J.height<1)return O;let ot=10,bt=(vt,Pt)=>{if(!vt)return;let St=vt.getBoundingClientRect();if(St.width<1||St.height<1)return;if(Pt==="top"||Pt==="bottom"){let Ut=St.right-J.left-O.left,Vt=J.right-St.left-O.right;if(Ut<=24||Vt<=24)return}let Wt=Pt==="left"?St.right-J.left:Pt==="right"?J.right-St.left:Pt==="top"?St.bottom-J.top:J.bottom-St.top,P=Pt==="left"||Pt==="right"?J.width*.4:J.height*.4;O[Pt]=Math.max(O[Pt],Math.min(Wt+ot,P))},At=p!==null&&p.getBoundingClientRect().width>J.width*.5;if(p&&!At&&bt(p,"left"),bt(C,"right"),p&&At&&bt(p,"top"),bt(z,"top"),tt){let vt=tt.getBoundingClientRect(),Pt=vt.top+vt.height/2<J.top+J.height/2;bt(tt,Pt?"top":"bottom")}return bt(S,"bottom"),O},kt=()=>{let O=Ot();if(E.hidden)return O;let J=E.getBoundingClientRect(),ot=i.getBoundingClientRect();return J.width>=ot.width-40?O.bottom=Math.max(O.bottom,J.height+16):O.right=Math.max(O.right,J.width+24),O};function Et(O,{user:J=!1}={}){y=O,M=null;let ot=O?o.get(O)??null:null;x.setEmphasis({selectedId:O,pathEdges:null,pathFrom:null}),ot?(te(ot),E.hidden=!1,requestAnimationFrame(()=>{E.hidden||(x.setInsets(kt()),y&&x.focusOn(y,null))}),E.focus({preventScroll:!0})):(E.hidden=!0,E.innerHTML="",x.setInsets(Ot())),w.select(ot,E),J&&e.onSelect?.(ot)}function ie(O){M=O,y=null,x.setEmphasis({selectedId:null,pathEdges:O?[O]:null,pathFrom:null}),O?(nt(O),E.hidden=!1,requestAnimationFrame(()=>{E.hidden||x.setInsets(kt())}),E.focus({preventScroll:!0})):(E.hidden=!0,E.innerHTML="",x.setInsets(Ot())),w.selectEdge(O)}let Zt=O=>{O.key==="Escape"&&(y||M)&&(M?ie(null):Et(null,{user:!0}),g.focus({preventScroll:!0}),O.stopPropagation())};return i.addEventListener("keydown",Zt),D(),e.focus&&o.has(e.focus)&&Et(e.focus),{select:O=>Et(O),isolate:O=>k(O),fit:(O=!0)=>x.fit(O),setPaused:O=>x.setPaused(O),destroy:()=>{i.removeEventListener("keydown",Zt),W.disconnect(),x.dispose();for(let O of[g,v,p,E,C,S,z,tt])O?.remove();i.classList.remove("mm-root"),delete i.dataset.mmChrome}}}export{mi as CLUSTER_COLOURS,Bs as ForceSim3D,Gs as buildDegrees,qg as buildGraph,ml as clusterCentres3D,yn as clusterColour,Ue as formatMoney,zv as mountMoneyMap,Xo as radiusFor,Wo as shortLabel,xh as webglAvailable};
/*! Bundled license information:

three/build/three.core.js:
three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2026 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
