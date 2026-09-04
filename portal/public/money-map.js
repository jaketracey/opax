function Ho(i){return i.length>34?`${i.slice(0,32)}\u2026`:i}function Oe(i){let t=Math.abs(i);return t>=1e9?`$${(i/1e9).toFixed(1)}b`:t>=1e6?`$${(i/1e6).toFixed(1)}m`:t>=1e3?`$${Math.round(i/1e3)}k`:`$${Math.round(i)}`}function Go(i,t){let e=Math.max(0,t);return i==="links"?Math.min(26,5.5+3.6*Math.sqrt(e)):Math.max(7,Math.min(26,6+5.2*Math.log10(1+e)))}function ks(i){let t=new Map;for(let e of i)t.set(e.source,(t.get(e.source)??0)+1),t.set(e.target,(t.get(e.target)??0)+1);return t}var Zl=0,Sa=1,Jl=2;var Es=1,Kl=2,qi=3,An=0,Ae=1,Fe=2,gn=0,li=1,Ea=2,wa=3,Ta=4,jl=5;var Gn=100,Ql=101,tc=102,ec=103,nc=104,ic=200,sc=201,rc=202,oc=203,cr=204,hr=205,ac=206,lc=207,cc=208,hc=209,uc=210,dc=211,fc=212,pc=213,mc=214,ur=0,dr=1,fr=2,ci=3,pr=4,mr=5,gr=6,xr=7,Aa=0,gc=1,xc=2,sn=0,Ca=1,Ra=2,Ia=3,Pa=4,La=5,Da=6,Na=7;var Ua=300,Zn=301,ui=302,kr=303,Hr=304,ws=306,_r=1e3,dn=1001,vr=1002,we=1003,_c=1004;var Ts=1005;var Te=1006,Gr=1007;var Jn=1008;var Ve=1009,Fa=1010,Oa=1011,$i=1012,Wr=1013,rn=1014,on=1015,xn=1016,Xr=1017,Yr=1018,Zi=1020,Ba=35902,za=35899,Va=1021,ka=1022,Ke=1023,fn=1026,Kn=1027,Ha=1028,qr=1029,jn=1030,$r=1031;var Zr=1033,As=33776,Cs=33777,Rs=33778,Is=33779,Jr=35840,Kr=35841,jr=35842,Qr=35843,to=36196,eo=37492,no=37496,io=37488,so=37489,Ps=37490,ro=37491,oo=37808,ao=37809,lo=37810,co=37811,ho=37812,uo=37813,fo=37814,po=37815,mo=37816,go=37817,xo=37818,_o=37819,vo=37820,yo=37821,bo=36492,Mo=36494,So=36495,Eo=36283,wo=36284,Ls=36285,To=36286;var os=2300,yr=2301,lr=2302,da=2303,fa=2400,pa=2401,ma=2402;var vc=3200;var Ao=0,yc=1,In="",We="srgb",as="srgb-linear",ls="linear",ne="srgb";var oi=7680;var ga=519,bc=512,Mc=513,Sc=514,Co=515,Ec=516,wc=517,Ro=518,Tc=519,xa=35044,Ga=35048;var Wa="300 es",en=2e3,Ni=2001;function Nh(i){for(let t=i.length-1;t>=0;--t)if(i[t]>=65535)return!0;return!1}function Uh(i){return ArrayBuffer.isView(i)&&!(i instanceof DataView)}function cs(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function Ac(){let i=cs("canvas");return i.style.display="block",i}var Tl={},Ui=null;function Xa(...i){let t="THREE."+i.shift();Ui?Ui("log",t,...i):console.log(t,...i)}function Cc(i){let t=i[0];if(typeof t=="string"&&t.startsWith("TSL:")){let e=i[1];e&&e.isStackTrace?i[0]+=" "+e.getLocation():i[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return i}function Nt(...i){i=Cc(i);let t="THREE."+i.shift();if(Ui)Ui("warn",t,...i);else{let e=i[0];e&&e.isStackTrace?console.warn(e.getError(t)):console.warn(t,...i)}}function Ft(...i){i=Cc(i);let t="THREE."+i.shift();if(Ui)Ui("error",t,...i);else{let e=i[0];e&&e.isStackTrace?console.error(e.getError(t)):console.error(t,...i)}}function ai(...i){let t=i.join(" ");t in Tl||(Tl[t]=!0,Nt(...i))}function Rc(i,t,e){return new Promise(function(n,s){function r(){switch(i.clientWaitSync(t,i.SYNC_FLUSH_COMMANDS_BIT,0)){case i.WAIT_FAILED:s();break;case i.TIMEOUT_EXPIRED:setTimeout(r,e);break;default:n()}}setTimeout(r,e)})}var Ic={[ur]:dr,[fr]:gr,[pr]:xr,[ci]:mr,[dr]:ur,[gr]:fr,[xr]:pr,[mr]:ci},pn=class{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){let n=this._listeners;return n===void 0?!1:n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){let n=this._listeners;if(n===void 0)return;let s=n[t];if(s!==void 0){let r=s.indexOf(e);r!==-1&&s.splice(r,1)}}dispatchEvent(t){let e=this._listeners;if(e===void 0)return;let n=e[t.type];if(n!==void 0){t.target=this;let s=n.slice(0);for(let r=0,o=s.length;r<o;r++)s[r].call(this,t);t.target=null}}},Re=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],Al=1234567,ss=Math.PI/180,Fi=180/Math.PI;function Ji(){let i=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(Re[i&255]+Re[i>>8&255]+Re[i>>16&255]+Re[i>>24&255]+"-"+Re[t&255]+Re[t>>8&255]+"-"+Re[t>>16&15|64]+Re[t>>24&255]+"-"+Re[e&63|128]+Re[e>>8&255]+"-"+Re[e>>16&255]+Re[e>>24&255]+Re[n&255]+Re[n>>8&255]+Re[n>>16&255]+Re[n>>24&255]).toLowerCase()}function jt(i,t,e){return Math.max(t,Math.min(e,i))}function Ya(i,t){return(i%t+t)%t}function Fh(i,t,e,n,s){return n+(i-t)*(s-n)/(e-t)}function Oh(i,t,e){return i!==t?(e-i)/(t-i):0}function rs(i,t,e){return(1-e)*i+e*t}function Bh(i,t,e,n){return rs(i,t,1-Math.exp(-e*n))}function zh(i,t=1){return t-Math.abs(Ya(i,t*2)-t)}function Vh(i,t,e){return i<=t?0:i>=e?1:(i=(i-t)/(e-t),i*i*(3-2*i))}function kh(i,t,e){return i<=t?0:i>=e?1:(i=(i-t)/(e-t),i*i*i*(i*(i*6-15)+10))}function Hh(i,t){return i+Math.floor(Math.random()*(t-i+1))}function Gh(i,t){return i+Math.random()*(t-i)}function Wh(i){return i*(.5-Math.random())}function Xh(i){i!==void 0&&(Al=i);let t=Al+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}function Yh(i){return i*ss}function qh(i){return i*Fi}function $h(i){return(i&i-1)===0&&i!==0}function Zh(i){return Math.pow(2,Math.ceil(Math.log(i)/Math.LN2))}function Jh(i){return Math.pow(2,Math.floor(Math.log(i)/Math.LN2))}function Kh(i,t,e,n,s){let r=Math.cos,o=Math.sin,a=r(e/2),l=o(e/2),c=r((t+n)/2),h=o((t+n)/2),d=r((t-n)/2),u=o((t-n)/2),f=r((n-t)/2),m=o((n-t)/2);switch(s){case"XYX":i.set(a*h,l*d,l*u,a*c);break;case"YZY":i.set(l*u,a*h,l*d,a*c);break;case"ZXZ":i.set(l*d,l*u,a*h,a*c);break;case"XZX":i.set(a*h,l*m,l*f,a*c);break;case"YXY":i.set(l*f,a*h,l*m,a*c);break;case"ZYZ":i.set(l*m,l*f,a*h,a*c);break;default:Nt("MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+s)}}function Li(i,t){switch(t.constructor){case Float32Array:return i;case Uint32Array:return i/4294967295;case Uint16Array:return i/65535;case Uint8Array:return i/255;case Int32Array:return Math.max(i/2147483647,-1);case Int16Array:return Math.max(i/32767,-1);case Int8Array:return Math.max(i/127,-1);default:throw new Error("THREE.MathUtils: Invalid component type.")}}function Ne(i,t){switch(t.constructor){case Float32Array:return i;case Uint32Array:return Math.round(i*4294967295);case Uint16Array:return Math.round(i*65535);case Uint8Array:return Math.round(i*255);case Int32Array:return Math.round(i*2147483647);case Int16Array:return Math.round(i*32767);case Int8Array:return Math.round(i*127);default:throw new Error("THREE.MathUtils: Invalid component type.")}}var Qn={DEG2RAD:ss,RAD2DEG:Fi,generateUUID:Ji,clamp:jt,euclideanModulo:Ya,mapLinear:Fh,inverseLerp:Oh,lerp:rs,damp:Bh,pingpong:zh,smoothstep:Vh,smootherstep:kh,randInt:Hh,randFloat:Gh,randFloatSpread:Wh,seededRandom:Xh,degToRad:Yh,radToDeg:qh,isPowerOfTwo:$h,ceilPowerOfTwo:Zh,floorPowerOfTwo:Jh,setQuaternionFromProperEuler:Kh,normalize:Ne,denormalize:Li},Jt=class i{static{i.prototype.isVector2=!0}constructor(t=0,e=0){this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("THREE.Vector2: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){let e=this.x,n=this.y,s=t.elements;return this.x=s[0]*e+s[3]*n+s[6],this.y=s[1]*e+s[4]*n+s[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=jt(this.x,t.x,e.x),this.y=jt(this.y,t.y,e.y),this}clampScalar(t,e){return this.x=jt(this.x,t,e),this.y=jt(this.y,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(jt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(jt(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){let n=Math.cos(e),s=Math.sin(e),r=this.x-t.x,o=this.y-t.y;return this.x=r*n-o*s+t.x,this.y=r*s+o*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},mn=class{constructor(t=0,e=0,n=0,s=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=s}static slerpFlat(t,e,n,s,r,o,a){let l=n[s+0],c=n[s+1],h=n[s+2],d=n[s+3],u=r[o+0],f=r[o+1],m=r[o+2],v=r[o+3];if(d!==v||l!==u||c!==f||h!==m){let g=l*u+c*f+h*m+d*v;g<0&&(u=-u,f=-f,m=-m,v=-v,g=-g);let p=1-a;if(g<.9995){let A=Math.acos(g),w=Math.sin(A);p=Math.sin(p*A)/w,a=Math.sin(a*A)/w,l=l*p+u*a,c=c*p+f*a,h=h*p+m*a,d=d*p+v*a}else{l=l*p+u*a,c=c*p+f*a,h=h*p+m*a,d=d*p+v*a;let A=1/Math.sqrt(l*l+c*c+h*h+d*d);l*=A,c*=A,h*=A,d*=A}}t[e]=l,t[e+1]=c,t[e+2]=h,t[e+3]=d}static multiplyQuaternionsFlat(t,e,n,s,r,o){let a=n[s],l=n[s+1],c=n[s+2],h=n[s+3],d=r[o],u=r[o+1],f=r[o+2],m=r[o+3];return t[e]=a*m+h*d+l*f-c*u,t[e+1]=l*m+h*u+c*d-a*f,t[e+2]=c*m+h*f+a*u-l*d,t[e+3]=h*m-a*d-l*u-c*f,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,s){return this._x=t,this._y=e,this._z=n,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){let n=t._x,s=t._y,r=t._z,o=t._order,a=Math.cos,l=Math.sin,c=a(n/2),h=a(s/2),d=a(r/2),u=l(n/2),f=l(s/2),m=l(r/2);switch(o){case"XYZ":this._x=u*h*d+c*f*m,this._y=c*f*d-u*h*m,this._z=c*h*m+u*f*d,this._w=c*h*d-u*f*m;break;case"YXZ":this._x=u*h*d+c*f*m,this._y=c*f*d-u*h*m,this._z=c*h*m-u*f*d,this._w=c*h*d+u*f*m;break;case"ZXY":this._x=u*h*d-c*f*m,this._y=c*f*d+u*h*m,this._z=c*h*m+u*f*d,this._w=c*h*d-u*f*m;break;case"ZYX":this._x=u*h*d-c*f*m,this._y=c*f*d+u*h*m,this._z=c*h*m-u*f*d,this._w=c*h*d+u*f*m;break;case"YZX":this._x=u*h*d+c*f*m,this._y=c*f*d+u*h*m,this._z=c*h*m-u*f*d,this._w=c*h*d-u*f*m;break;case"XZY":this._x=u*h*d-c*f*m,this._y=c*f*d-u*h*m,this._z=c*h*m+u*f*d,this._w=c*h*d+u*f*m;break;default:Nt("Quaternion: .setFromEuler() encountered an unknown order: "+o)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){let n=e/2,s=Math.sin(n);return this._x=t.x*s,this._y=t.y*s,this._z=t.z*s,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){let e=t.elements,n=e[0],s=e[4],r=e[8],o=e[1],a=e[5],l=e[9],c=e[2],h=e[6],d=e[10],u=n+a+d;if(u>0){let f=.5/Math.sqrt(u+1);this._w=.25/f,this._x=(h-l)*f,this._y=(r-c)*f,this._z=(o-s)*f}else if(n>a&&n>d){let f=2*Math.sqrt(1+n-a-d);this._w=(h-l)/f,this._x=.25*f,this._y=(s+o)/f,this._z=(r+c)/f}else if(a>d){let f=2*Math.sqrt(1+a-n-d);this._w=(r-c)/f,this._x=(s+o)/f,this._y=.25*f,this._z=(l+h)/f}else{let f=2*Math.sqrt(1+d-n-a);this._w=(o-s)/f,this._x=(r+c)/f,this._y=(l+h)/f,this._z=.25*f}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<1e-8?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(jt(this.dot(t),-1,1)))}rotateTowards(t,e){let n=this.angleTo(t);if(n===0)return this;let s=Math.min(1,e/n);return this.slerp(t,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){let n=t._x,s=t._y,r=t._z,o=t._w,a=e._x,l=e._y,c=e._z,h=e._w;return this._x=n*h+o*a+s*c-r*l,this._y=s*h+o*l+r*a-n*c,this._z=r*h+o*c+n*l-s*a,this._w=o*h-n*a-s*l-r*c,this._onChangeCallback(),this}slerp(t,e){let n=t._x,s=t._y,r=t._z,o=t._w,a=this.dot(t);a<0&&(n=-n,s=-s,r=-r,o=-o,a=-a);let l=1-e;if(a<.9995){let c=Math.acos(a),h=Math.sin(c);l=Math.sin(l*c)/h,e=Math.sin(e*c)/h,this._x=this._x*l+n*e,this._y=this._y*l+s*e,this._z=this._z*l+r*e,this._w=this._w*l+o*e,this._onChangeCallback()}else this._x=this._x*l+n*e,this._y=this._y*l+s*e,this._z=this._z*l+r*e,this._w=this._w*l+o*e,this.normalize();return this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){let t=2*Math.PI*Math.random(),e=2*Math.PI*Math.random(),n=Math.random(),s=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(s*Math.sin(t),s*Math.cos(t),r*Math.sin(e),r*Math.cos(e))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},N=class i{static{i.prototype.isVector3=!0}constructor(t=0,e=0,n=0){this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("THREE.Vector3: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(Cl.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(Cl.setFromAxisAngle(t,e))}applyMatrix3(t){let e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[3]*n+r[6]*s,this.y=r[1]*e+r[4]*n+r[7]*s,this.z=r[2]*e+r[5]*n+r[8]*s,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){let e=this.x,n=this.y,s=this.z,r=t.elements,o=1/(r[3]*e+r[7]*n+r[11]*s+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*s+r[12])*o,this.y=(r[1]*e+r[5]*n+r[9]*s+r[13])*o,this.z=(r[2]*e+r[6]*n+r[10]*s+r[14])*o,this}applyQuaternion(t){let e=this.x,n=this.y,s=this.z,r=t.x,o=t.y,a=t.z,l=t.w,c=2*(o*s-a*n),h=2*(a*e-r*s),d=2*(r*n-o*e);return this.x=e+l*c+o*d-a*h,this.y=n+l*h+a*c-r*d,this.z=s+l*d+r*h-o*c,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){let e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*s,this.y=r[1]*e+r[5]*n+r[9]*s,this.z=r[2]*e+r[6]*n+r[10]*s,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=jt(this.x,t.x,e.x),this.y=jt(this.y,t.y,e.y),this.z=jt(this.z,t.z,e.z),this}clampScalar(t,e){return this.x=jt(this.x,t,e),this.y=jt(this.y,t,e),this.z=jt(this.z,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(jt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){let n=t.x,s=t.y,r=t.z,o=e.x,a=e.y,l=e.z;return this.x=s*l-r*a,this.y=r*o-n*l,this.z=n*a-s*o,this}projectOnVector(t){let e=t.lengthSq();if(e===0)return this.set(0,0,0);let n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return Wo.copy(this).projectOnVector(t),this.sub(Wo)}reflect(t){return this.sub(Wo.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(jt(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y,s=this.z-t.z;return e*e+n*n+s*s}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){let s=Math.sin(e)*t;return this.x=s*Math.sin(n),this.y=Math.cos(e)*t,this.z=s*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){let e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),s=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=s,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let t=Math.random()*Math.PI*2,e=Math.random()*2-1,n=Math.sqrt(1-e*e);return this.x=n*Math.cos(t),this.y=e,this.z=n*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},Wo=new N,Cl=new mn,Bt=class i{static{i.prototype.isMatrix3=!0}constructor(t,e,n,s,r,o,a,l,c){this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,o,a,l,c)}set(t,e,n,s,r,o,a,l,c){let h=this.elements;return h[0]=t,h[1]=s,h[2]=a,h[3]=e,h[4]=r,h[5]=l,h[6]=n,h[7]=o,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){let e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,s=e.elements,r=this.elements,o=n[0],a=n[3],l=n[6],c=n[1],h=n[4],d=n[7],u=n[2],f=n[5],m=n[8],v=s[0],g=s[3],p=s[6],A=s[1],w=s[4],M=s[7],y=s[2],S=s[5],C=s[8];return r[0]=o*v+a*A+l*y,r[3]=o*g+a*w+l*S,r[6]=o*p+a*M+l*C,r[1]=c*v+h*A+d*y,r[4]=c*g+h*w+d*S,r[7]=c*p+h*M+d*C,r[2]=u*v+f*A+m*y,r[5]=u*g+f*w+m*S,r[8]=u*p+f*M+m*C,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],h=t[8];return e*o*h-e*a*c-n*r*h+n*a*l+s*r*c-s*o*l}invert(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],h=t[8],d=h*o-a*c,u=a*l-h*r,f=c*r-o*l,m=e*d+n*u+s*f;if(m===0)return this.set(0,0,0,0,0,0,0,0,0);let v=1/m;return t[0]=d*v,t[1]=(s*c-h*n)*v,t[2]=(a*n-s*o)*v,t[3]=u*v,t[4]=(h*e-s*l)*v,t[5]=(s*r-a*e)*v,t[6]=f*v,t[7]=(n*l-c*e)*v,t[8]=(o*e-n*r)*v,this}transpose(){let t,e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){let e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,s,r,o,a){let l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*o+c*a)+o+t,-s*c,s*l,-s*(-c*o+l*a)+a+e,0,0,1),this}scale(t,e){return ai("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(Xo.makeScale(t,e)),this}rotate(t){return ai("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(Xo.makeRotation(-t)),this}translate(t,e){return ai("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(Xo.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){let e=this.elements,n=t.elements;for(let s=0;s<9;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}},Xo=new Bt,Rl=new Bt().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Il=new Bt().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function jh(){let i={enabled:!0,workingColorSpace:as,spaces:{},convert:function(s,r,o){return this.enabled===!1||r===o||!r||!o||(this.spaces[r].transfer===ne&&(s.r=Tn(s.r),s.g=Tn(s.g),s.b=Tn(s.b)),this.spaces[r].primaries!==this.spaces[o].primaries&&(s.applyMatrix3(this.spaces[r].toXYZ),s.applyMatrix3(this.spaces[o].fromXYZ)),this.spaces[o].transfer===ne&&(s.r=Di(s.r),s.g=Di(s.g),s.b=Di(s.b))),s},workingToColorSpace:function(s,r){return this.convert(s,this.workingColorSpace,r)},colorSpaceToWorking:function(s,r){return this.convert(s,r,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===In?ls:this.spaces[s].transfer},getToneMappingMode:function(s){return this.spaces[s].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(s,r=this.workingColorSpace){return s.fromArray(this.spaces[r].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,r,o){return s.copy(this.spaces[r].toXYZ).multiply(this.spaces[o].fromXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(s,r){return ai("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),i.workingToColorSpace(s,r)},toWorkingColorSpace:function(s,r){return ai("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),i.colorSpaceToWorking(s,r)}},t=[.64,.33,.3,.6,.15,.06],e=[.2126,.7152,.0722],n=[.3127,.329];return i.define({[as]:{primaries:t,whitePoint:n,transfer:ls,toXYZ:Rl,fromXYZ:Il,luminanceCoefficients:e,workingColorSpaceConfig:{unpackColorSpace:We},outputColorSpaceConfig:{drawingBufferColorSpace:We}},[We]:{primaries:t,whitePoint:n,transfer:ne,toXYZ:Rl,fromXYZ:Il,luminanceCoefficients:e,outputColorSpaceConfig:{drawingBufferColorSpace:We}}}),i}var Kt=jh();function Tn(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function Di(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}var yi,br=class{static getDataURL(t,e="image/png"){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let n;if(t instanceof HTMLCanvasElement)n=t;else{yi===void 0&&(yi=cs("canvas")),yi.width=t.width,yi.height=t.height;let s=yi.getContext("2d");t instanceof ImageData?s.putImageData(t,0,0):s.drawImage(t,0,0,t.width,t.height),n=yi}return n.toDataURL(e)}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){let e=cs("canvas");e.width=t.width,e.height=t.height;let n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);let s=n.getImageData(0,0,t.width,t.height),r=s.data;for(let o=0;o<r.length;o++)r[o]=Tn(r[o]/255)*255;return n.putImageData(s,0,0),e}else if(t.data){let e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(Tn(e[n]/255)*255):e[n]=Tn(e[n]);return{data:e,width:t.width,height:t.height}}else return Nt("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}},Qh=0,Oi=class{constructor(t=null){this.isSource=!0,Object.defineProperty(this,"id",{value:Qh++}),this.uuid=Ji(),this.data=t,this.dataReady=!0,this.version=0}getSize(t){let e=this.data;return typeof HTMLVideoElement<"u"&&e instanceof HTMLVideoElement?t.set(e.videoWidth,e.videoHeight,0):typeof VideoFrame<"u"&&e instanceof VideoFrame?t.set(e.displayWidth,e.displayHeight,0):e!==null?t.set(e.width,e.height,e.depth||0):t.set(0,0,0),t}set needsUpdate(t){t===!0&&this.version++}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];let n={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let o=0,a=s.length;o<a;o++)s[o].isDataTexture?r.push(Yo(s[o].image)):r.push(Yo(s[o]))}else r=Yo(s);n.url=r}return e||(t.images[this.uuid]=n),n}};function Yo(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?br.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(Nt("Texture: Unable to serialize Texture."),{})}var tu=0,qo=new N,Be=class i extends pn{constructor(t=i.DEFAULT_IMAGE,e=i.DEFAULT_MAPPING,n=dn,s=dn,r=Te,o=Jn,a=Ke,l=Ve,c=i.DEFAULT_ANISOTROPY,h=In){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:tu++}),this.uuid=Ji(),this.name="",this.source=new Oi(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=s,this.magFilter=r,this.minFilter=o,this.anisotropy=c,this.format=a,this.internalFormat=null,this.type=l,this.offset=new Jt(0,0),this.repeat=new Jt(1,1),this.center=new Jt(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Bt,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(qo).x}get height(){return this.source.getSize(qo).y}get depth(){return this.source.getSize(qo).z}get image(){return this.source.data}set image(t){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.normalized=t.normalized,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.renderTarget=t.renderTarget,this.isRenderTargetTexture=t.isRenderTargetTexture,this.isArrayTexture=t.isArrayTexture,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}setValues(t){for(let e in t){let n=t[e];if(n===void 0){Nt(`Texture.setValues(): parameter '${e}' has value of undefined.`);continue}let s=this[e];if(s===void 0){Nt(`Texture.setValues(): property '${e}' does not exist.`);continue}s&&n&&s.isVector2&&n.isVector2||s&&n&&s.isVector3&&n.isVector3||s&&n&&s.isMatrix3&&n.isMatrix3?s.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];let n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==Ua)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case _r:t.x=t.x-Math.floor(t.x);break;case dn:t.x=t.x<0?0:1;break;case vr:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case _r:t.y=t.y-Math.floor(t.y);break;case dn:t.y=t.y<0?0:1;break;case vr:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}};Be.DEFAULT_IMAGE=null;Be.DEFAULT_MAPPING=Ua;Be.DEFAULT_ANISOTROPY=1;var de=class i{static{i.prototype.isVector4=!0}constructor(t=0,e=0,n=0,s=1){this.x=t,this.y=e,this.z=n,this.w=s}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,s){return this.x=t,this.y=e,this.z=n,this.w=s,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("THREE.Vector4: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){let e=this.x,n=this.y,s=this.z,r=this.w,o=t.elements;return this.x=o[0]*e+o[4]*n+o[8]*s+o[12]*r,this.y=o[1]*e+o[5]*n+o[9]*s+o[13]*r,this.z=o[2]*e+o[6]*n+o[10]*s+o[14]*r,this.w=o[3]*e+o[7]*n+o[11]*s+o[15]*r,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);let e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,s,r,l=t.elements,c=l[0],h=l[4],d=l[8],u=l[1],f=l[5],m=l[9],v=l[2],g=l[6],p=l[10];if(Math.abs(h-u)<.01&&Math.abs(d-v)<.01&&Math.abs(m-g)<.01){if(Math.abs(h+u)<.1&&Math.abs(d+v)<.1&&Math.abs(m+g)<.1&&Math.abs(c+f+p-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;let w=(c+1)/2,M=(f+1)/2,y=(p+1)/2,S=(h+u)/4,C=(d+v)/4,_=(m+g)/4;return w>M&&w>y?w<.01?(n=0,s=.707106781,r=.707106781):(n=Math.sqrt(w),s=S/n,r=C/n):M>y?M<.01?(n=.707106781,s=0,r=.707106781):(s=Math.sqrt(M),n=S/s,r=_/s):y<.01?(n=.707106781,s=.707106781,r=0):(r=Math.sqrt(y),n=C/r,s=_/r),this.set(n,s,r,e),this}let A=Math.sqrt((g-m)*(g-m)+(d-v)*(d-v)+(u-h)*(u-h));return Math.abs(A)<.001&&(A=1),this.x=(g-m)/A,this.y=(d-v)/A,this.z=(u-h)/A,this.w=Math.acos((c+f+p-1)/2),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this.w=e[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=jt(this.x,t.x,e.x),this.y=jt(this.y,t.y,e.y),this.z=jt(this.z,t.z,e.z),this.w=jt(this.w,t.w,e.w),this}clampScalar(t,e){return this.x=jt(this.x,t,e),this.y=jt(this.y,t,e),this.z=jt(this.z,t,e),this.w=jt(this.w,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(jt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},Mr=class extends pn{constructor(t=1,e=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Te,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=t,this.height=e,this.depth=n.depth,this.scissor=new de(0,0,t,e),this.scissorTest=!1,this.viewport=new de(0,0,t,e),this.textures=[];let s={width:t,height:e,depth:n.depth},r=new Be(s),o=n.count;for(let a=0;a<o;a++)this.textures[a]=r.clone(),this.textures[a].isRenderTargetTexture=!0,this.textures[a].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(t={}){let e={minFilter:Te,generateMipmaps:!1,flipY:!1,internalFormat:null};t.mapping!==void 0&&(e.mapping=t.mapping),t.wrapS!==void 0&&(e.wrapS=t.wrapS),t.wrapT!==void 0&&(e.wrapT=t.wrapT),t.wrapR!==void 0&&(e.wrapR=t.wrapR),t.magFilter!==void 0&&(e.magFilter=t.magFilter),t.minFilter!==void 0&&(e.minFilter=t.minFilter),t.format!==void 0&&(e.format=t.format),t.type!==void 0&&(e.type=t.type),t.anisotropy!==void 0&&(e.anisotropy=t.anisotropy),t.colorSpace!==void 0&&(e.colorSpace=t.colorSpace),t.flipY!==void 0&&(e.flipY=t.flipY),t.generateMipmaps!==void 0&&(e.generateMipmaps=t.generateMipmaps),t.internalFormat!==void 0&&(e.internalFormat=t.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(e)}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}set depthTexture(t){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),t!==null&&(t.renderTarget=this),this._depthTexture=t}get depthTexture(){return this._depthTexture}setSize(t,e,n=1){if(this.width!==t||this.height!==e||this.depth!==n){this.width=t,this.height=e,this.depth=n;for(let s=0,r=this.textures.length;s<r;s++)this.textures[s].image.width=t,this.textures[s].image.height=e,this.textures[s].image.depth=n,this.textures[s].isData3DTexture!==!0&&(this.textures[s].isArrayTexture=this.textures[s].image.depth>1);this.dispose()}this.viewport.set(0,0,t,e),this.scissor.set(0,0,t,e)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let e=0,n=t.textures.length;e<n;e++){this.textures[e]=t.textures[e].clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;let s=Object.assign({},t.textures[e].image);this.textures[e].source=new Oi(s)}return this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,t.depthTexture!==null&&(this.depthTexture=t.depthTexture.clone()),this.samples=t.samples,this.multiview=t.multiview,this.useArrayDepthTexture=t.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}},Xe=class extends Mr{constructor(t=1,e=1,n={}){super(t,e,n),this.isWebGLRenderTarget=!0}},hs=class extends Be{constructor(t=null,e=1,n=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=we,this.minFilter=we,this.wrapR=dn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}};var Sr=class extends Be{constructor(t=null,e=1,n=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=we,this.minFilter=we,this.wrapR=dn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var ue=class i{static{i.prototype.isMatrix4=!0}constructor(t,e,n,s,r,o,a,l,c,h,d,u,f,m,v,g){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,o,a,l,c,h,d,u,f,m,v,g)}set(t,e,n,s,r,o,a,l,c,h,d,u,f,m,v,g){let p=this.elements;return p[0]=t,p[4]=e,p[8]=n,p[12]=s,p[1]=r,p[5]=o,p[9]=a,p[13]=l,p[2]=c,p[6]=h,p[10]=d,p[14]=u,p[3]=f,p[7]=m,p[11]=v,p[15]=g,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new i().fromArray(this.elements)}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){let e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){let e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return this.determinantAffine()===0?(t.set(1,0,0),e.set(0,1,0),n.set(0,0,1),this):(t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){if(t.determinantAffine()===0)return this.identity();let e=this.elements,n=t.elements,s=1/bi.setFromMatrixColumn(t,0).length(),r=1/bi.setFromMatrixColumn(t,1).length(),o=1/bi.setFromMatrixColumn(t,2).length();return e[0]=n[0]*s,e[1]=n[1]*s,e[2]=n[2]*s,e[3]=0,e[4]=n[4]*r,e[5]=n[5]*r,e[6]=n[6]*r,e[7]=0,e[8]=n[8]*o,e[9]=n[9]*o,e[10]=n[10]*o,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){let e=this.elements,n=t.x,s=t.y,r=t.z,o=Math.cos(n),a=Math.sin(n),l=Math.cos(s),c=Math.sin(s),h=Math.cos(r),d=Math.sin(r);if(t.order==="XYZ"){let u=o*h,f=o*d,m=a*h,v=a*d;e[0]=l*h,e[4]=-l*d,e[8]=c,e[1]=f+m*c,e[5]=u-v*c,e[9]=-a*l,e[2]=v-u*c,e[6]=m+f*c,e[10]=o*l}else if(t.order==="YXZ"){let u=l*h,f=l*d,m=c*h,v=c*d;e[0]=u+v*a,e[4]=m*a-f,e[8]=o*c,e[1]=o*d,e[5]=o*h,e[9]=-a,e[2]=f*a-m,e[6]=v+u*a,e[10]=o*l}else if(t.order==="ZXY"){let u=l*h,f=l*d,m=c*h,v=c*d;e[0]=u-v*a,e[4]=-o*d,e[8]=m+f*a,e[1]=f+m*a,e[5]=o*h,e[9]=v-u*a,e[2]=-o*c,e[6]=a,e[10]=o*l}else if(t.order==="ZYX"){let u=o*h,f=o*d,m=a*h,v=a*d;e[0]=l*h,e[4]=m*c-f,e[8]=u*c+v,e[1]=l*d,e[5]=v*c+u,e[9]=f*c-m,e[2]=-c,e[6]=a*l,e[10]=o*l}else if(t.order==="YZX"){let u=o*l,f=o*c,m=a*l,v=a*c;e[0]=l*h,e[4]=v-u*d,e[8]=m*d+f,e[1]=d,e[5]=o*h,e[9]=-a*h,e[2]=-c*h,e[6]=f*d+m,e[10]=u-v*d}else if(t.order==="XZY"){let u=o*l,f=o*c,m=a*l,v=a*c;e[0]=l*h,e[4]=-d,e[8]=c*h,e[1]=u*d+v,e[5]=o*h,e[9]=f*d-m,e[2]=m*d-f,e[6]=a*h,e[10]=v*d+u}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(eu,t,nu)}lookAt(t,e,n){let s=this.elements;return He.subVectors(t,e),He.lengthSq()===0&&(He.z=1),He.normalize(),Fn.crossVectors(n,He),Fn.lengthSq()===0&&(Math.abs(n.z)===1?He.x+=1e-4:He.z+=1e-4,He.normalize(),Fn.crossVectors(n,He)),Fn.normalize(),Hs.crossVectors(He,Fn),s[0]=Fn.x,s[4]=Hs.x,s[8]=He.x,s[1]=Fn.y,s[5]=Hs.y,s[9]=He.y,s[2]=Fn.z,s[6]=Hs.z,s[10]=He.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,s=e.elements,r=this.elements,o=n[0],a=n[4],l=n[8],c=n[12],h=n[1],d=n[5],u=n[9],f=n[13],m=n[2],v=n[6],g=n[10],p=n[14],A=n[3],w=n[7],M=n[11],y=n[15],S=s[0],C=s[4],_=s[8],E=s[12],R=s[1],I=s[5],L=s[9],Y=s[13],q=s[2],O=s[6],z=s[10],k=s[14],$=s[3],et=s[7],rt=s[11],ot=s[15];return r[0]=o*S+a*R+l*q+c*$,r[4]=o*C+a*I+l*O+c*et,r[8]=o*_+a*L+l*z+c*rt,r[12]=o*E+a*Y+l*k+c*ot,r[1]=h*S+d*R+u*q+f*$,r[5]=h*C+d*I+u*O+f*et,r[9]=h*_+d*L+u*z+f*rt,r[13]=h*E+d*Y+u*k+f*ot,r[2]=m*S+v*R+g*q+p*$,r[6]=m*C+v*I+g*O+p*et,r[10]=m*_+v*L+g*z+p*rt,r[14]=m*E+v*Y+g*k+p*ot,r[3]=A*S+w*R+M*q+y*$,r[7]=A*C+w*I+M*O+y*et,r[11]=A*_+w*L+M*z+y*rt,r[15]=A*E+w*Y+M*k+y*ot,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[4],s=t[8],r=t[12],o=t[1],a=t[5],l=t[9],c=t[13],h=t[2],d=t[6],u=t[10],f=t[14],m=t[3],v=t[7],g=t[11],p=t[15],A=l*f-c*u,w=a*f-c*d,M=a*u-l*d,y=o*f-c*h,S=o*u-l*h,C=o*d-a*h;return e*(v*A-g*w+p*M)-n*(m*A-g*y+p*S)+s*(m*w-v*y+p*C)-r*(m*M-v*S+g*C)}determinantAffine(){let t=this.elements,e=t[0],n=t[4],s=t[8],r=t[1],o=t[5],a=t[9],l=t[2],c=t[6],h=t[10];return e*(o*h-a*c)-n*(r*h-a*l)+s*(r*c-o*l)}transpose(){let t=this.elements,e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){let s=this.elements;return t.isVector3?(s[12]=t.x,s[13]=t.y,s[14]=t.z):(s[12]=t,s[13]=e,s[14]=n),this}invert(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],h=t[8],d=t[9],u=t[10],f=t[11],m=t[12],v=t[13],g=t[14],p=t[15],A=e*a-n*o,w=e*l-s*o,M=e*c-r*o,y=n*l-s*a,S=n*c-r*a,C=s*c-r*l,_=h*v-d*m,E=h*g-u*m,R=h*p-f*m,I=d*g-u*v,L=d*p-f*v,Y=u*p-f*g,q=A*Y-w*L+M*I+y*R-S*E+C*_;if(q===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let O=1/q;return t[0]=(a*Y-l*L+c*I)*O,t[1]=(s*L-n*Y-r*I)*O,t[2]=(v*C-g*S+p*y)*O,t[3]=(u*S-d*C-f*y)*O,t[4]=(l*R-o*Y-c*E)*O,t[5]=(e*Y-s*R+r*E)*O,t[6]=(g*M-m*C-p*w)*O,t[7]=(h*C-u*M+f*w)*O,t[8]=(o*L-a*R+c*_)*O,t[9]=(n*R-e*L-r*_)*O,t[10]=(m*S-v*M+p*A)*O,t[11]=(d*M-h*S-f*A)*O,t[12]=(a*E-o*I-l*_)*O,t[13]=(e*I-n*E+s*_)*O,t[14]=(v*w-m*y-g*A)*O,t[15]=(h*y-d*w+u*A)*O,this}scale(t){let e=this.elements,n=t.x,s=t.y,r=t.z;return e[0]*=n,e[4]*=s,e[8]*=r,e[1]*=n,e[5]*=s,e[9]*=r,e[2]*=n,e[6]*=s,e[10]*=r,e[3]*=n,e[7]*=s,e[11]*=r,this}getMaxScaleOnAxis(){let t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],s=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,s))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){let e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){let n=Math.cos(e),s=Math.sin(e),r=1-n,o=t.x,a=t.y,l=t.z,c=r*o,h=r*a;return this.set(c*o+n,c*a-s*l,c*l+s*a,0,c*a+s*l,h*a+n,h*l-s*o,0,c*l-s*a,h*l+s*o,r*l*l+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,s,r,o){return this.set(1,n,r,0,t,1,o,0,e,s,1,0,0,0,0,1),this}compose(t,e,n){let s=this.elements,r=e._x,o=e._y,a=e._z,l=e._w,c=r+r,h=o+o,d=a+a,u=r*c,f=r*h,m=r*d,v=o*h,g=o*d,p=a*d,A=l*c,w=l*h,M=l*d,y=n.x,S=n.y,C=n.z;return s[0]=(1-(v+p))*y,s[1]=(f+M)*y,s[2]=(m-w)*y,s[3]=0,s[4]=(f-M)*S,s[5]=(1-(u+p))*S,s[6]=(g+A)*S,s[7]=0,s[8]=(m+w)*C,s[9]=(g-A)*C,s[10]=(1-(u+v))*C,s[11]=0,s[12]=t.x,s[13]=t.y,s[14]=t.z,s[15]=1,this}decompose(t,e,n){let s=this.elements;t.x=s[12],t.y=s[13],t.z=s[14];let r=this.determinantAffine();if(r===0)return n.set(1,1,1),e.identity(),this;let o=bi.set(s[0],s[1],s[2]).length(),a=bi.set(s[4],s[5],s[6]).length(),l=bi.set(s[8],s[9],s[10]).length();r<0&&(o=-o),je.copy(this);let c=1/o,h=1/a,d=1/l;return je.elements[0]*=c,je.elements[1]*=c,je.elements[2]*=c,je.elements[4]*=h,je.elements[5]*=h,je.elements[6]*=h,je.elements[8]*=d,je.elements[9]*=d,je.elements[10]*=d,e.setFromRotationMatrix(je),n.x=o,n.y=a,n.z=l,this}makePerspective(t,e,n,s,r,o,a=en,l=!1){let c=this.elements,h=2*r/(e-t),d=2*r/(n-s),u=(e+t)/(e-t),f=(n+s)/(n-s),m,v;if(l)m=r/(o-r),v=o*r/(o-r);else if(a===en)m=-(o+r)/(o-r),v=-2*o*r/(o-r);else if(a===Ni)m=-o/(o-r),v=-o*r/(o-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return c[0]=h,c[4]=0,c[8]=u,c[12]=0,c[1]=0,c[5]=d,c[9]=f,c[13]=0,c[2]=0,c[6]=0,c[10]=m,c[14]=v,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(t,e,n,s,r,o,a=en,l=!1){let c=this.elements,h=2/(e-t),d=2/(n-s),u=-(e+t)/(e-t),f=-(n+s)/(n-s),m,v;if(l)m=1/(o-r),v=o/(o-r);else if(a===en)m=-2/(o-r),v=-(o+r)/(o-r);else if(a===Ni)m=-1/(o-r),v=-r/(o-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return c[0]=h,c[4]=0,c[8]=0,c[12]=u,c[1]=0,c[5]=d,c[9]=0,c[13]=f,c[2]=0,c[6]=0,c[10]=m,c[14]=v,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(t){let e=this.elements,n=t.elements;for(let s=0;s<16;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}},bi=new N,je=new ue,eu=new N(0,0,0),nu=new N(1,1,1),Fn=new N,Hs=new N,He=new N,Pl=new ue,Ll=new mn,Cn=class i{constructor(t=0,e=0,n=0,s=i.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=s}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,s=this._order){return this._x=t,this._y=e,this._z=n,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){let s=t.elements,r=s[0],o=s[4],a=s[8],l=s[1],c=s[5],h=s[9],d=s[2],u=s[6],f=s[10];switch(e){case"XYZ":this._y=Math.asin(jt(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-h,f),this._z=Math.atan2(-o,r)):(this._x=Math.atan2(u,c),this._z=0);break;case"YXZ":this._x=Math.asin(-jt(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(a,f),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-d,r),this._z=0);break;case"ZXY":this._x=Math.asin(jt(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(-d,f),this._z=Math.atan2(-o,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-jt(d,-1,1)),Math.abs(d)<.9999999?(this._x=Math.atan2(u,f),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-o,c));break;case"YZX":this._z=Math.asin(jt(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-d,r)):(this._x=0,this._y=Math.atan2(a,f));break;case"XZY":this._z=Math.asin(-jt(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(u,c),this._y=Math.atan2(a,r)):(this._x=Math.atan2(-h,f),this._y=0);break;default:Nt("Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return Pl.makeRotationFromQuaternion(t),this.setFromRotationMatrix(Pl,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return Ll.setFromEuler(this),this.setFromQuaternion(Ll,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};Cn.DEFAULT_ORDER="XYZ";var Bi=class{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}},iu=0,Dl=new N,Mi=new mn,bn=new ue,Gs=new N,ts=new N,su=new N,ru=new mn,Nl=new N(1,0,0),Ul=new N(0,1,0),Fl=new N(0,0,1),Ol={type:"added"},ou={type:"removed"},Si={type:"childadded",child:null},$o={type:"childremoved",child:null},Le=class i extends pn{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:iu++}),this.uuid=Ji(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=i.DEFAULT_UP.clone();let t=new N,e=new Cn,n=new mn,s=new N(1,1,1);function r(){n.setFromEuler(e,!1)}function o(){e.setFromQuaternion(n,void 0,!1)}e._onChange(r),n._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new ue},normalMatrix:{value:new Bt}}),this.matrix=new ue,this.matrixWorld=new ue,this.matrixAutoUpdate=i.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=i.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Bi,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return Mi.setFromAxisAngle(t,e),this.quaternion.multiply(Mi),this}rotateOnWorldAxis(t,e){return Mi.setFromAxisAngle(t,e),this.quaternion.premultiply(Mi),this}rotateX(t){return this.rotateOnAxis(Nl,t)}rotateY(t){return this.rotateOnAxis(Ul,t)}rotateZ(t){return this.rotateOnAxis(Fl,t)}translateOnAxis(t,e){return Dl.copy(t).applyQuaternion(this.quaternion),this.position.add(Dl.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(Nl,t)}translateY(t){return this.translateOnAxis(Ul,t)}translateZ(t){return this.translateOnAxis(Fl,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(bn.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?Gs.copy(t):Gs.set(t,e,n);let s=this.parent;this.updateWorldMatrix(!0,!1),ts.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?bn.lookAt(ts,Gs,this.up):bn.lookAt(Gs,ts,this.up),this.quaternion.setFromRotationMatrix(bn),s&&(bn.extractRotation(s.matrixWorld),Mi.setFromRotationMatrix(bn),this.quaternion.premultiply(Mi.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(Ft("Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(Ol),Si.child=t,this.dispatchEvent(Si),Si.child=null):Ft("Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(ou),$o.child=t,this.dispatchEvent($o),$o.child=null),this}removeFromParent(){let t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),bn.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),bn.multiply(t.parent.matrixWorld)),t.applyMatrix4(bn),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(Ol),Si.child=t,this.dispatchEvent(Si),Si.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,s=this.children.length;n<s;n++){let o=this.children[n].getObjectByProperty(t,e);if(o!==void 0)return o}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);let s=this.children;for(let r=0,o=s.length;r<o;r++)s[r].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ts,t,su),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ts,ru,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);let e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}traverse(t){t(this);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverseVisible(t)}traverseAncestors(t){let e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let t=this.pivot;if(t!==null){let e=t.x,n=t.y,s=t.z,r=this.matrix.elements;r[12]+=e-r[0]*e-r[4]*n-r[8]*s,r[13]+=n-r[1]*e-r[5]*n-r[9]*s,r[14]+=s-r[2]*e-r[6]*n-r[10]*s}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].updateMatrixWorld(t)}updateWorldMatrix(t,e,n=!1){let s=this.parent;if(t===!0&&s!==null&&s.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),e===!0){let r=this.children;for(let o=0,a=r.length;o<a;o++)r[o].updateWorldMatrix(!1,!0,n)}}toJSON(t){let e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let s={};s.uuid=this.uuid,s.type=this.type,this.name!==""&&(s.name=this.name),this.castShadow===!0&&(s.castShadow=!0),this.receiveShadow===!0&&(s.receiveShadow=!0),this.visible===!1&&(s.visible=!1),this.frustumCulled===!1&&(s.frustumCulled=!1),this.renderOrder!==0&&(s.renderOrder=this.renderOrder),this.static!==!1&&(s.static=this.static),Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.pivot!==null&&(s.pivot=this.pivot.toArray()),this.matrixAutoUpdate===!1&&(s.matrixAutoUpdate=!1),this.morphTargetDictionary!==void 0&&(s.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(s.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.geometryInfo=this._geometryInfo.map(a=>({...a,boundingBox:a.boundingBox?a.boundingBox.toJSON():void 0,boundingSphere:a.boundingSphere?a.boundingSphere.toJSON():void 0})),s.instanceInfo=this._instanceInfo.map(a=>({...a})),s.availableInstanceIds=this._availableInstanceIds.slice(),s.availableGeometryIds=this._availableGeometryIds.slice(),s.nextIndexStart=this._nextIndexStart,s.nextVertexStart=this._nextVertexStart,s.geometryCount=this._geometryCount,s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.matricesTexture=this._matricesTexture.toJSON(t),s.indirectTexture=this._indirectTexture.toJSON(t),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(s.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(s.boundingBox=this.boundingBox.toJSON()));function r(a,l){return a[l.uuid]===void 0&&(a[l.uuid]=l.toJSON(t)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(t.geometries,this.geometry);let a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){let l=a.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){let d=l[c];r(t.shapes,d)}else r(t.shapes,l)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(t.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let a=[];for(let l=0,c=this.material.length;l<c;l++)a.push(r(t.materials,this.material[l]));s.material=a}else s.material=r(t.materials,this.material);if(this.children.length>0){s.children=[];for(let a=0;a<this.children.length;a++)s.children.push(this.children[a].toJSON(t).object)}if(this.animations.length>0){s.animations=[];for(let a=0;a<this.animations.length;a++){let l=this.animations[a];s.animations.push(r(t.animations,l))}}if(e){let a=o(t.geometries),l=o(t.materials),c=o(t.textures),h=o(t.images),d=o(t.shapes),u=o(t.skeletons),f=o(t.animations),m=o(t.nodes);a.length>0&&(n.geometries=a),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),h.length>0&&(n.images=h),d.length>0&&(n.shapes=d),u.length>0&&(n.skeletons=u),f.length>0&&(n.animations=f),m.length>0&&(n.nodes=m)}return n.object=s,n;function o(a){let l=[];for(let c in a){let h=a[c];delete h.metadata,l.push(h)}return l}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.pivot=t.pivot!==null?t.pivot.clone():null,this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.static=t.static,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){let s=t.children[n];this.add(s.clone())}return this}};Le.DEFAULT_UP=new N(0,1,0);Le.DEFAULT_MATRIX_AUTO_UPDATE=!0;Le.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var Je=class extends Le{constructor(){super(),this.isGroup=!0,this.type="Group"}},au={type:"move"},zi=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Je,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Je,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new N,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new N),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Je,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new N,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new N,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){let e=this._hand;if(e)for(let n of t.hand.values())this._getHandJoint(e,n)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,e,n){let s=null,r=null,o=null,a=this._targetRay,l=this._grip,c=this._hand;if(t&&e.session.visibilityState!=="visible-blurred"){if(c&&t.hand){o=!0;for(let v of t.hand.values()){let g=e.getJointPose(v,n),p=this._getHandJoint(c,v);g!==null&&(p.matrix.fromArray(g.transform.matrix),p.matrix.decompose(p.position,p.rotation,p.scale),p.matrixWorldNeedsUpdate=!0,p.jointRadius=g.radius),p.visible=g!==null}let h=c.joints["index-finger-tip"],d=c.joints["thumb-tip"],u=h.position.distanceTo(d.position),f=.02,m=.005;c.inputState.pinching&&u>f+m?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!c.inputState.pinching&&u<=f-m&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else l!==null&&t.gripSpace&&(r=e.getPose(t.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1,l.eventsEnabled&&l.dispatchEvent({type:"gripUpdated",data:t,target:this})));a!==null&&(s=e.getPose(t.targetRaySpace,n),s===null&&r!==null&&(s=r),s!==null&&(a.matrix.fromArray(s.transform.matrix),a.matrix.decompose(a.position,a.rotation,a.scale),a.matrixWorldNeedsUpdate=!0,s.linearVelocity?(a.hasLinearVelocity=!0,a.linearVelocity.copy(s.linearVelocity)):a.hasLinearVelocity=!1,s.angularVelocity?(a.hasAngularVelocity=!0,a.angularVelocity.copy(s.angularVelocity)):a.hasAngularVelocity=!1,this.dispatchEvent(au)))}return a!==null&&(a.visible=s!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=o!==null),this}_getHandJoint(t,e){if(t.joints[e.jointName]===void 0){let n=new Je;n.matrixAutoUpdate=!1,n.visible=!1,t.joints[e.jointName]=n,t.add(n)}return t.joints[e.jointName]}},Pc={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},On={h:0,s:0,l:0},Ws={h:0,s:0,l:0};function Zo(i,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?i+(t-i)*6*e:e<1/2?t:e<2/3?i+(t-i)*6*(2/3-e):i}var zt=class{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){let s=t;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=We){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,Kt.colorSpaceToWorking(this,e),this}setRGB(t,e,n,s=Kt.workingColorSpace){return this.r=t,this.g=e,this.b=n,Kt.colorSpaceToWorking(this,s),this}setHSL(t,e,n,s=Kt.workingColorSpace){if(t=Ya(t,1),e=jt(e,0,1),n=jt(n,0,1),e===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+e):n+e-n*e,o=2*n-r;this.r=Zo(o,r,t+1/3),this.g=Zo(o,r,t),this.b=Zo(o,r,t-1/3)}return Kt.colorSpaceToWorking(this,s),this}setStyle(t,e=We){function n(r){r!==void 0&&parseFloat(r)<1&&Nt("Color: Alpha component of "+t+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(t)){let r,o=s[1],a=s[2];switch(o){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,e);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,e);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,e);break;default:Nt("Color: Unknown color model "+t)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(t)){let r=s[1],o=r.length;if(o===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,e);if(o===6)return this.setHex(parseInt(r,16),e);Nt("Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=We){let n=Pc[t.toLowerCase()];return n!==void 0?this.setHex(n,e):Nt("Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=Tn(t.r),this.g=Tn(t.g),this.b=Tn(t.b),this}copyLinearToSRGB(t){return this.r=Di(t.r),this.g=Di(t.g),this.b=Di(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=We){return Kt.workingToColorSpace(Ie.copy(this),t),Math.round(jt(Ie.r*255,0,255))*65536+Math.round(jt(Ie.g*255,0,255))*256+Math.round(jt(Ie.b*255,0,255))}getHexString(t=We){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=Kt.workingColorSpace){Kt.workingToColorSpace(Ie.copy(this),e);let n=Ie.r,s=Ie.g,r=Ie.b,o=Math.max(n,s,r),a=Math.min(n,s,r),l,c,h=(a+o)/2;if(a===o)l=0,c=0;else{let d=o-a;switch(c=h<=.5?d/(o+a):d/(2-o-a),o){case n:l=(s-r)/d+(s<r?6:0);break;case s:l=(r-n)/d+2;break;case r:l=(n-s)/d+4;break}l/=6}return t.h=l,t.s=c,t.l=h,t}getRGB(t,e=Kt.workingColorSpace){return Kt.workingToColorSpace(Ie.copy(this),e),t.r=Ie.r,t.g=Ie.g,t.b=Ie.b,t}getStyle(t=We){Kt.workingToColorSpace(Ie.copy(this),t);let e=Ie.r,n=Ie.g,s=Ie.b;return t!==We?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(s*255)})`}offsetHSL(t,e,n){return this.getHSL(On),this.setHSL(On.h+t,On.s+e,On.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(On),t.getHSL(Ws);let n=rs(On.h,Ws.h,e),s=rs(On.s,Ws.s,e),r=rs(On.l,Ws.l,e);return this.setHSL(n,s,r),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){let e=this.r,n=this.g,s=this.b,r=t.elements;return this.r=r[0]*e+r[3]*n+r[6]*s,this.g=r[1]*e+r[4]*n+r[7]*s,this.b=r[2]*e+r[5]*n+r[8]*s,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Ie=new zt;zt.NAMES=Pc;var us=class i{constructor(t,e=1,n=1e3){this.isFog=!0,this.name="",this.color=new zt(t),this.near=e,this.far=n}clone(){return new i(this.color,this.near,this.far)}toJSON(){return{type:"Fog",name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}},ds=class extends Le{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Cn,this.environmentIntensity=1,this.environmentRotation=new Cn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,e){return super.copy(t,e),t.background!==null&&(this.background=t.background.clone()),t.environment!==null&&(this.environment=t.environment.clone()),t.fog!==null&&(this.fog=t.fog.clone()),this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),t.overrideMaterial!==null&&(this.overrideMaterial=t.overrideMaterial.clone()),this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){let e=super.toJSON(t);return this.fog!==null&&(e.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(e.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(e.object.backgroundIntensity=this.backgroundIntensity),e.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(e.object.environmentIntensity=this.environmentIntensity),e.object.environmentRotation=this.environmentRotation.toArray(),e}},Qe=new N,Mn=new N,Jo=new N,Sn=new N,Ei=new N,wi=new N,Bl=new N,Ko=new N,jo=new N,Qo=new N,ta=new de,ea=new de,na=new de,Hn=class i{constructor(t=new N,e=new N,n=new N){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,s){s.subVectors(n,e),Qe.subVectors(t,e),s.cross(Qe);let r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(t,e,n,s,r){Qe.subVectors(s,e),Mn.subVectors(n,e),Jo.subVectors(t,e);let o=Qe.dot(Qe),a=Qe.dot(Mn),l=Qe.dot(Jo),c=Mn.dot(Mn),h=Mn.dot(Jo),d=o*c-a*a;if(d===0)return r.set(0,0,0),null;let u=1/d,f=(c*l-a*h)*u,m=(o*h-a*l)*u;return r.set(1-f-m,m,f)}static containsPoint(t,e,n,s){return this.getBarycoord(t,e,n,s,Sn)===null?!1:Sn.x>=0&&Sn.y>=0&&Sn.x+Sn.y<=1}static getInterpolation(t,e,n,s,r,o,a,l){return this.getBarycoord(t,e,n,s,Sn)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,Sn.x),l.addScaledVector(o,Sn.y),l.addScaledVector(a,Sn.z),l)}static getInterpolatedAttribute(t,e,n,s,r,o){return ta.setScalar(0),ea.setScalar(0),na.setScalar(0),ta.fromBufferAttribute(t,e),ea.fromBufferAttribute(t,n),na.fromBufferAttribute(t,s),o.setScalar(0),o.addScaledVector(ta,r.x),o.addScaledVector(ea,r.y),o.addScaledVector(na,r.z),o}static isFrontFacing(t,e,n,s){return Qe.subVectors(n,e),Mn.subVectors(t,e),Qe.cross(Mn).dot(s)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,s){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[s]),this}setFromAttributeAndIndices(t,e,n,s){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,s),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return Qe.subVectors(this.c,this.b),Mn.subVectors(this.a,this.b),Qe.cross(Mn).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return i.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return i.getBarycoord(t,this.a,this.b,this.c,e)}getInterpolation(t,e,n,s,r){return i.getInterpolation(t,this.a,this.b,this.c,e,n,s,r)}containsPoint(t){return i.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return i.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){let n=this.a,s=this.b,r=this.c,o,a;Ei.subVectors(s,n),wi.subVectors(r,n),Ko.subVectors(t,n);let l=Ei.dot(Ko),c=wi.dot(Ko);if(l<=0&&c<=0)return e.copy(n);jo.subVectors(t,s);let h=Ei.dot(jo),d=wi.dot(jo);if(h>=0&&d<=h)return e.copy(s);let u=l*d-h*c;if(u<=0&&l>=0&&h<=0)return o=l/(l-h),e.copy(n).addScaledVector(Ei,o);Qo.subVectors(t,r);let f=Ei.dot(Qo),m=wi.dot(Qo);if(m>=0&&f<=m)return e.copy(r);let v=f*c-l*m;if(v<=0&&c>=0&&m<=0)return a=c/(c-m),e.copy(n).addScaledVector(wi,a);let g=h*m-f*d;if(g<=0&&d-h>=0&&f-m>=0)return Bl.subVectors(r,s),a=(d-h)/(d-h+(f-m)),e.copy(s).addScaledVector(Bl,a);let p=1/(g+v+u);return o=v*p,a=u*p,e.copy(n).addScaledVector(Ei,o).addScaledVector(wi,a)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}},Wn=class{constructor(t=new N(1/0,1/0,1/0),e=new N(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(tn.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(tn.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){let n=tn.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);let n=t.geometry;if(n!==void 0){let r=n.getAttribute("position");if(e===!0&&r!==void 0&&t.isInstancedMesh!==!0)for(let o=0,a=r.count;o<a;o++)t.isMesh===!0?t.getVertexPosition(o,tn):tn.fromBufferAttribute(r,o),tn.applyMatrix4(t.matrixWorld),this.expandByPoint(tn);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),Xs.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),Xs.copy(n.boundingBox)),Xs.applyMatrix4(t.matrixWorld),this.union(Xs)}let s=t.children;for(let r=0,o=s.length;r<o;r++)this.expandByObject(s[r],e);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,tn),tn.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(es),Ys.subVectors(this.max,es),Ti.subVectors(t.a,es),Ai.subVectors(t.b,es),Ci.subVectors(t.c,es),Bn.subVectors(Ai,Ti),zn.subVectors(Ci,Ai),ni.subVectors(Ti,Ci);let e=[0,-Bn.z,Bn.y,0,-zn.z,zn.y,0,-ni.z,ni.y,Bn.z,0,-Bn.x,zn.z,0,-zn.x,ni.z,0,-ni.x,-Bn.y,Bn.x,0,-zn.y,zn.x,0,-ni.y,ni.x,0];return!ia(e,Ti,Ai,Ci,Ys)||(e=[1,0,0,0,1,0,0,0,1],!ia(e,Ti,Ai,Ci,Ys))?!1:(qs.crossVectors(Bn,zn),e=[qs.x,qs.y,qs.z],ia(e,Ti,Ai,Ci,Ys))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,tn).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(tn).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(En[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),En[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),En[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),En[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),En[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),En[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),En[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),En[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(En),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(t){return this.min.fromArray(t.min),this.max.fromArray(t.max),this}},En=[new N,new N,new N,new N,new N,new N,new N,new N],tn=new N,Xs=new Wn,Ti=new N,Ai=new N,Ci=new N,Bn=new N,zn=new N,ni=new N,es=new N,Ys=new N,qs=new N,ii=new N;function ia(i,t,e,n,s){for(let r=0,o=i.length-3;r<=o;r+=3){ii.fromArray(i,r);let a=s.x*Math.abs(ii.x)+s.y*Math.abs(ii.y)+s.z*Math.abs(ii.z),l=t.dot(ii),c=e.dot(ii),h=n.dot(ii);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>a)return!1}return!0}var ve=new N,$s=new Jt,lu=0,ye=class extends pn{constructor(t,e,n=!1){if(super(),Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:lu++}),this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=xa,this.updateRanges=[],this.gpuType=on,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[t+s]=e.array[n+s];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)$s.fromBufferAttribute(this,e),$s.applyMatrix3(t),this.setXY(e,$s.x,$s.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)ve.fromBufferAttribute(this,e),ve.applyMatrix3(t),this.setXYZ(e,ve.x,ve.y,ve.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)ve.fromBufferAttribute(this,e),ve.applyMatrix4(t),this.setXYZ(e,ve.x,ve.y,ve.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)ve.fromBufferAttribute(this,e),ve.applyNormalMatrix(t),this.setXYZ(e,ve.x,ve.y,ve.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)ve.fromBufferAttribute(this,e),ve.transformDirection(t),this.setXYZ(e,ve.x,ve.y,ve.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=Li(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=Ne(n,this.array)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=Li(e,this.array)),e}setX(t,e){return this.normalized&&(e=Ne(e,this.array)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=Li(e,this.array)),e}setY(t,e){return this.normalized&&(e=Ne(e,this.array)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=Li(e,this.array)),e}setZ(t,e){return this.normalized&&(e=Ne(e,this.array)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=Li(e,this.array)),e}setW(t,e){return this.normalized&&(e=Ne(e,this.array)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=Ne(e,this.array),n=Ne(n,this.array)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,s){return t*=this.itemSize,this.normalized&&(e=Ne(e,this.array),n=Ne(n,this.array),s=Ne(s,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this}setXYZW(t,e,n,s,r){return t*=this.itemSize,this.normalized&&(e=Ne(e,this.array),n=Ne(n,this.array),s=Ne(s,this.array),r=Ne(r,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this.array[t+3]=r,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(t.name=this.name),this.usage!==xa&&(t.usage=this.usage),t}dispose(){this.dispatchEvent({type:"dispose"})}};var fs=class extends ye{constructor(t,e,n){super(new Uint16Array(t),e,n)}};var ps=class extends ye{constructor(t,e,n){super(new Uint32Array(t),e,n)}};var Ee=class extends ye{constructor(t,e,n){super(new Float32Array(t),e,n)}},cu=new Wn,ns=new N,sa=new N,Vi=class{constructor(t=new N,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){let n=this.center;e!==void 0?n.copy(e):cu.setFromPoints(t).getCenter(n);let s=0;for(let r=0,o=t.length;r<o;r++)s=Math.max(s,n.distanceToSquared(t[r]));return this.radius=Math.sqrt(s),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){let e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){let n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;ns.subVectors(t,this.center);let e=ns.lengthSq();if(e>this.radius*this.radius){let n=Math.sqrt(e),s=(n-this.radius)*.5;this.center.addScaledVector(ns,s/n),this.radius+=s}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(sa.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(ns.copy(t.center).add(sa)),this.expandByPoint(ns.copy(t.center).sub(sa))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(t){return this.radius=t.radius,this.center.fromArray(t.center),this}},hu=0,$e=new ue,ra=new Le,Ri=new N,Ge=new Wn,is=new Wn,Se=new N,ze=class i extends pn{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:hu++}),this.uuid=Ji(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(Nh(t)?ps:fs)(t,1):this.index=t,this}setIndirect(t,e=0){return this.indirect=t,this.indirectOffset=e,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){let e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new Bt().getNormalMatrix(t);n.applyNormalMatrix(r),n.needsUpdate=!0}let s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(t),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(t){return $e.makeRotationFromQuaternion(t),this.applyMatrix4($e),this}rotateX(t){return $e.makeRotationX(t),this.applyMatrix4($e),this}rotateY(t){return $e.makeRotationY(t),this.applyMatrix4($e),this}rotateZ(t){return $e.makeRotationZ(t),this.applyMatrix4($e),this}translate(t,e,n){return $e.makeTranslation(t,e,n),this.applyMatrix4($e),this}scale(t,e,n){return $e.makeScale(t,e,n),this.applyMatrix4($e),this}lookAt(t){return ra.lookAt(t),ra.updateMatrix(),this.applyMatrix4(ra.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Ri).negate(),this.translate(Ri.x,Ri.y,Ri.z),this}setFromPoints(t){let e=this.getAttribute("position");if(e===void 0){let n=[];for(let s=0,r=t.length;s<r;s++){let o=t[s];n.push(o.x,o.y,o.z||0)}this.setAttribute("position",new Ee(n,3))}else{let n=Math.min(t.length,e.count);for(let s=0;s<n;s++){let r=t[s];e.setXYZ(s,r.x,r.y,r.z||0)}t.length>e.count&&Nt("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),e.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Wn);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){Ft("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new N(-1/0,-1/0,-1/0),new N(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,s=e.length;n<s;n++){let r=e[n];Ge.setFromBufferAttribute(r),this.morphTargetsRelative?(Se.addVectors(this.boundingBox.min,Ge.min),this.boundingBox.expandByPoint(Se),Se.addVectors(this.boundingBox.max,Ge.max),this.boundingBox.expandByPoint(Se)):(this.boundingBox.expandByPoint(Ge.min),this.boundingBox.expandByPoint(Ge.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&Ft('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Vi);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){Ft("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new N,1/0);return}if(t){let n=this.boundingSphere.center;if(Ge.setFromBufferAttribute(t),e)for(let r=0,o=e.length;r<o;r++){let a=e[r];is.setFromBufferAttribute(a),this.morphTargetsRelative?(Se.addVectors(Ge.min,is.min),Ge.expandByPoint(Se),Se.addVectors(Ge.max,is.max),Ge.expandByPoint(Se)):(Ge.expandByPoint(is.min),Ge.expandByPoint(is.max))}Ge.getCenter(n);let s=0;for(let r=0,o=t.count;r<o;r++)Se.fromBufferAttribute(t,r),s=Math.max(s,n.distanceToSquared(Se));if(e)for(let r=0,o=e.length;r<o;r++){let a=e[r],l=this.morphTargetsRelative;for(let c=0,h=a.count;c<h;c++)Se.fromBufferAttribute(a,c),l&&(Ri.fromBufferAttribute(t,c),Se.add(Ri)),s=Math.max(s,n.distanceToSquared(Se))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&Ft('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){Ft("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=e.position,s=e.normal,r=e.uv,o=this.getAttribute("tangent");(o===void 0||o.count!==n.count)&&(o=new ye(new Float32Array(4*n.count),4),this.setAttribute("tangent",o));let a=[],l=[];for(let _=0;_<n.count;_++)a[_]=new N,l[_]=new N;let c=new N,h=new N,d=new N,u=new Jt,f=new Jt,m=new Jt,v=new N,g=new N;function p(_,E,R){c.fromBufferAttribute(n,_),h.fromBufferAttribute(n,E),d.fromBufferAttribute(n,R),u.fromBufferAttribute(r,_),f.fromBufferAttribute(r,E),m.fromBufferAttribute(r,R),h.sub(c),d.sub(c),f.sub(u),m.sub(u);let I=1/(f.x*m.y-m.x*f.y);isFinite(I)&&(v.copy(h).multiplyScalar(m.y).addScaledVector(d,-f.y).multiplyScalar(I),g.copy(d).multiplyScalar(f.x).addScaledVector(h,-m.x).multiplyScalar(I),a[_].add(v),a[E].add(v),a[R].add(v),l[_].add(g),l[E].add(g),l[R].add(g))}let A=this.groups;A.length===0&&(A=[{start:0,count:t.count}]);for(let _=0,E=A.length;_<E;++_){let R=A[_],I=R.start,L=R.count;for(let Y=I,q=I+L;Y<q;Y+=3)p(t.getX(Y+0),t.getX(Y+1),t.getX(Y+2))}let w=new N,M=new N,y=new N,S=new N;function C(_){y.fromBufferAttribute(s,_),S.copy(y);let E=a[_];w.copy(E),w.sub(y.multiplyScalar(y.dot(E))).normalize(),M.crossVectors(S,E);let I=M.dot(l[_])<0?-1:1;o.setXYZW(_,w.x,w.y,w.z,I)}for(let _=0,E=A.length;_<E;++_){let R=A[_],I=R.start,L=R.count;for(let Y=I,q=I+L;Y<q;Y+=3)C(t.getX(Y+0)),C(t.getX(Y+1)),C(t.getX(Y+2))}this._transformed=!0}computeVertexNormals(){let t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==e.count)n=new ye(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let u=0,f=n.count;u<f;u++)n.setXYZ(u,0,0,0);let s=new N,r=new N,o=new N,a=new N,l=new N,c=new N,h=new N,d=new N;if(t)for(let u=0,f=t.count;u<f;u+=3){let m=t.getX(u+0),v=t.getX(u+1),g=t.getX(u+2);s.fromBufferAttribute(e,m),r.fromBufferAttribute(e,v),o.fromBufferAttribute(e,g),h.subVectors(o,r),d.subVectors(s,r),h.cross(d),a.fromBufferAttribute(n,m),l.fromBufferAttribute(n,v),c.fromBufferAttribute(n,g),a.add(h),l.add(h),c.add(h),n.setXYZ(m,a.x,a.y,a.z),n.setXYZ(v,l.x,l.y,l.z),n.setXYZ(g,c.x,c.y,c.z)}else for(let u=0,f=e.count;u<f;u+=3)s.fromBufferAttribute(e,u+0),r.fromBufferAttribute(e,u+1),o.fromBufferAttribute(e,u+2),h.subVectors(o,r),d.subVectors(s,r),h.cross(d),n.setXYZ(u+0,h.x,h.y,h.z),n.setXYZ(u+1,h.x,h.y,h.z),n.setXYZ(u+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)Se.fromBufferAttribute(t,e),Se.normalize(),t.setXYZ(e,Se.x,Se.y,Se.z)}toNonIndexed(){function t(a,l){let c=a.array,h=a.itemSize,d=a.normalized,u=new c.constructor(l.length*h),f=0,m=0;for(let v=0,g=l.length;v<g;v++){a.isInterleavedBufferAttribute?f=l[v]*a.data.stride+a.offset:f=l[v]*h;for(let p=0;p<h;p++)u[m++]=c[f++]}return new ye(u,h,d)}if(this.index===null)return Nt("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let e=new i,n=this.index.array,s=this.attributes;for(let a in s){let l=s[a],c=t(l,n);e.setAttribute(a,c)}let r=this.morphAttributes;for(let a in r){let l=[],c=r[a];for(let h=0,d=c.length;h<d;h++){let u=c[h],f=t(u,n);l.push(f)}e.morphAttributes[a]=l}e.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let a=0,l=o.length;a<l;a++){let c=o[a];e.addGroup(c.start,c.count,c.materialIndex)}return e}toJSON(){let t={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,this.name!==""&&(t.name=this.name),Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){let l=this.parameters;for(let c in l)l[c]!==void 0&&(t[c]=l[c]);return t}t.data={attributes:{}};let e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});let n=this.attributes;for(let l in n){let c=n[l];t.data.attributes[l]=c.toJSON(t.data)}let s={},r=!1;for(let l in this.morphAttributes){let c=this.morphAttributes[l],h=[];for(let d=0,u=c.length;d<u;d++){let f=c[d];h.push(f.toJSON(t.data))}h.length>0&&(s[l]=h,r=!0)}r&&(t.data.morphAttributes=s,t.data.morphTargetsRelative=this.morphTargetsRelative);let o=this.groups;o.length>0&&(t.data.groups=JSON.parse(JSON.stringify(o)));let a=this.boundingSphere;return a!==null&&(t.data.boundingSphere=a.toJSON()),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let e={};this.name=t.name;let n=t.index;n!==null&&this.setIndex(n.clone());let s=t.attributes;for(let c in s){let h=s[c];this.setAttribute(c,h.clone(e))}let r=t.morphAttributes;for(let c in r){let h=[],d=r[c];for(let u=0,f=d.length;u<f;u++)h.push(d[u].clone(e));this.morphAttributes[c]=h}this.morphTargetsRelative=t.morphTargetsRelative;let o=t.groups;for(let c=0,h=o.length;c<h;c++){let d=o[c];this.addGroup(d.start,d.count,d.materialIndex)}let a=t.boundingBox;a!==null&&(this.boundingBox=a.clone());let l=t.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this._transformed=t._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}};var uu=0,Xn=class extends pn{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:uu++}),this.uuid=Ji(),this.name="",this.type="Material",this.blending=li,this.side=An,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=cr,this.blendDst=hr,this.blendEquation=Gn,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new zt(0,0,0),this.blendAlpha=0,this.depthFunc=ci,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=ga,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=oi,this.stencilZFail=oi,this.stencilZPass=oi,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(let e in t){let n=t[e];if(n===void 0){Nt(`Material: parameter '${e}' has value of undefined.`);continue}let s=this[e];if(s===void 0){Nt(`Material: '${e}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(n):s&&s.isVector2&&n&&n.isVector2||s&&s.isEuler&&n&&n.isEuler||s&&s.isVector3&&n&&n.isVector3?s.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});let n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(t).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(t).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==li&&(n.blending=this.blending),this.side!==An&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==cr&&(n.blendSrc=this.blendSrc),this.blendDst!==hr&&(n.blendDst=this.blendDst),this.blendEquation!==Gn&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==ci&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==ga&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==oi&&(n.stencilFail=this.stencilFail),this.stencilZFail!==oi&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==oi&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.allowOverride===!1&&(n.allowOverride=!1),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function s(r){let o=[];for(let a in r){let l=r[a];delete l.metadata,o.push(l)}return o}if(e){let r=s(t.textures),o=s(t.images);r.length>0&&(n.textures=r),o.length>0&&(n.images=o)}return n}fromJSON(t,e){if(t.uuid!==void 0&&(this.uuid=t.uuid),t.name!==void 0&&(this.name=t.name),t.color!==void 0&&this.color!==void 0&&this.color.setHex(t.color),t.roughness!==void 0&&(this.roughness=t.roughness),t.metalness!==void 0&&(this.metalness=t.metalness),t.sheen!==void 0&&(this.sheen=t.sheen),t.sheenColor!==void 0&&(this.sheenColor=new zt().setHex(t.sheenColor)),t.sheenRoughness!==void 0&&(this.sheenRoughness=t.sheenRoughness),t.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(t.emissive),t.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(t.specular),t.specularIntensity!==void 0&&(this.specularIntensity=t.specularIntensity),t.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(t.specularColor),t.shininess!==void 0&&(this.shininess=t.shininess),t.clearcoat!==void 0&&(this.clearcoat=t.clearcoat),t.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=t.clearcoatRoughness),t.dispersion!==void 0&&(this.dispersion=t.dispersion),t.iridescence!==void 0&&(this.iridescence=t.iridescence),t.iridescenceIOR!==void 0&&(this.iridescenceIOR=t.iridescenceIOR),t.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=t.iridescenceThicknessRange),t.transmission!==void 0&&(this.transmission=t.transmission),t.thickness!==void 0&&(this.thickness=t.thickness),t.attenuationDistance!==void 0&&(this.attenuationDistance=t.attenuationDistance),t.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(t.attenuationColor),t.anisotropy!==void 0&&(this.anisotropy=t.anisotropy),t.anisotropyRotation!==void 0&&(this.anisotropyRotation=t.anisotropyRotation),t.fog!==void 0&&(this.fog=t.fog),t.flatShading!==void 0&&(this.flatShading=t.flatShading),t.blending!==void 0&&(this.blending=t.blending),t.combine!==void 0&&(this.combine=t.combine),t.side!==void 0&&(this.side=t.side),t.shadowSide!==void 0&&(this.shadowSide=t.shadowSide),t.opacity!==void 0&&(this.opacity=t.opacity),t.transparent!==void 0&&(this.transparent=t.transparent),t.alphaTest!==void 0&&(this.alphaTest=t.alphaTest),t.alphaHash!==void 0&&(this.alphaHash=t.alphaHash),t.depthFunc!==void 0&&(this.depthFunc=t.depthFunc),t.depthTest!==void 0&&(this.depthTest=t.depthTest),t.depthWrite!==void 0&&(this.depthWrite=t.depthWrite),t.colorWrite!==void 0&&(this.colorWrite=t.colorWrite),t.blendSrc!==void 0&&(this.blendSrc=t.blendSrc),t.blendDst!==void 0&&(this.blendDst=t.blendDst),t.blendEquation!==void 0&&(this.blendEquation=t.blendEquation),t.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=t.blendSrcAlpha),t.blendDstAlpha!==void 0&&(this.blendDstAlpha=t.blendDstAlpha),t.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=t.blendEquationAlpha),t.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(t.blendColor),t.blendAlpha!==void 0&&(this.blendAlpha=t.blendAlpha),t.stencilWriteMask!==void 0&&(this.stencilWriteMask=t.stencilWriteMask),t.stencilFunc!==void 0&&(this.stencilFunc=t.stencilFunc),t.stencilRef!==void 0&&(this.stencilRef=t.stencilRef),t.stencilFuncMask!==void 0&&(this.stencilFuncMask=t.stencilFuncMask),t.stencilFail!==void 0&&(this.stencilFail=t.stencilFail),t.stencilZFail!==void 0&&(this.stencilZFail=t.stencilZFail),t.stencilZPass!==void 0&&(this.stencilZPass=t.stencilZPass),t.stencilWrite!==void 0&&(this.stencilWrite=t.stencilWrite),t.wireframe!==void 0&&(this.wireframe=t.wireframe),t.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=t.wireframeLinewidth),t.wireframeLinecap!==void 0&&(this.wireframeLinecap=t.wireframeLinecap),t.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=t.wireframeLinejoin),t.rotation!==void 0&&(this.rotation=t.rotation),t.linewidth!==void 0&&(this.linewidth=t.linewidth),t.dashSize!==void 0&&(this.dashSize=t.dashSize),t.gapSize!==void 0&&(this.gapSize=t.gapSize),t.scale!==void 0&&(this.scale=t.scale),t.polygonOffset!==void 0&&(this.polygonOffset=t.polygonOffset),t.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=t.polygonOffsetFactor),t.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=t.polygonOffsetUnits),t.dithering!==void 0&&(this.dithering=t.dithering),t.alphaToCoverage!==void 0&&(this.alphaToCoverage=t.alphaToCoverage),t.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=t.premultipliedAlpha),t.forceSinglePass!==void 0&&(this.forceSinglePass=t.forceSinglePass),t.allowOverride!==void 0&&(this.allowOverride=t.allowOverride),t.visible!==void 0&&(this.visible=t.visible),t.toneMapped!==void 0&&(this.toneMapped=t.toneMapped),t.userData!==void 0&&(this.userData=t.userData),t.vertexColors!==void 0&&(typeof t.vertexColors=="number"?this.vertexColors=t.vertexColors>0:this.vertexColors=t.vertexColors),t.size!==void 0&&(this.size=t.size),t.sizeAttenuation!==void 0&&(this.sizeAttenuation=t.sizeAttenuation),t.map!==void 0&&(this.map=e[t.map]||null),t.matcap!==void 0&&(this.matcap=e[t.matcap]||null),t.alphaMap!==void 0&&(this.alphaMap=e[t.alphaMap]||null),t.bumpMap!==void 0&&(this.bumpMap=e[t.bumpMap]||null),t.bumpScale!==void 0&&(this.bumpScale=t.bumpScale),t.normalMap!==void 0&&(this.normalMap=e[t.normalMap]||null),t.normalMapType!==void 0&&(this.normalMapType=t.normalMapType),t.normalScale!==void 0){let n=t.normalScale;Array.isArray(n)===!1&&(n=[n,n]),this.normalScale=new Jt().fromArray(n)}return t.displacementMap!==void 0&&(this.displacementMap=e[t.displacementMap]||null),t.displacementScale!==void 0&&(this.displacementScale=t.displacementScale),t.displacementBias!==void 0&&(this.displacementBias=t.displacementBias),t.roughnessMap!==void 0&&(this.roughnessMap=e[t.roughnessMap]||null),t.metalnessMap!==void 0&&(this.metalnessMap=e[t.metalnessMap]||null),t.emissiveMap!==void 0&&(this.emissiveMap=e[t.emissiveMap]||null),t.emissiveIntensity!==void 0&&(this.emissiveIntensity=t.emissiveIntensity),t.specularMap!==void 0&&(this.specularMap=e[t.specularMap]||null),t.specularIntensityMap!==void 0&&(this.specularIntensityMap=e[t.specularIntensityMap]||null),t.specularColorMap!==void 0&&(this.specularColorMap=e[t.specularColorMap]||null),t.envMap!==void 0&&(this.envMap=e[t.envMap]||null),t.envMapRotation!==void 0&&this.envMapRotation.fromArray(t.envMapRotation),t.envMapIntensity!==void 0&&(this.envMapIntensity=t.envMapIntensity),t.reflectivity!==void 0&&(this.reflectivity=t.reflectivity),t.refractionRatio!==void 0&&(this.refractionRatio=t.refractionRatio),t.lightMap!==void 0&&(this.lightMap=e[t.lightMap]||null),t.lightMapIntensity!==void 0&&(this.lightMapIntensity=t.lightMapIntensity),t.aoMap!==void 0&&(this.aoMap=e[t.aoMap]||null),t.aoMapIntensity!==void 0&&(this.aoMapIntensity=t.aoMapIntensity),t.gradientMap!==void 0&&(this.gradientMap=e[t.gradientMap]||null),t.clearcoatMap!==void 0&&(this.clearcoatMap=e[t.clearcoatMap]||null),t.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=e[t.clearcoatRoughnessMap]||null),t.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=e[t.clearcoatNormalMap]||null),t.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new Jt().fromArray(t.clearcoatNormalScale)),t.iridescenceMap!==void 0&&(this.iridescenceMap=e[t.iridescenceMap]||null),t.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=e[t.iridescenceThicknessMap]||null),t.transmissionMap!==void 0&&(this.transmissionMap=e[t.transmissionMap]||null),t.thicknessMap!==void 0&&(this.thicknessMap=e[t.thicknessMap]||null),t.anisotropyMap!==void 0&&(this.anisotropyMap=e[t.anisotropyMap]||null),t.sheenColorMap!==void 0&&(this.sheenColorMap=e[t.sheenColorMap]||null),t.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=e[t.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;let e=t.clippingPlanes,n=null;if(e!==null){let s=e.length;n=new Array(s);for(let r=0;r!==s;++r)n[r]=e[r].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.allowOverride=t.allowOverride,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}};var wn=new N,oa=new N,Zs=new N,Vn=new N,aa=new N,Js=new N,la=new N,ms=class{constructor(t=new N,e=new N(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,wn)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);let n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){let e=wn.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(wn.copy(this.origin).addScaledVector(this.direction,e),wn.distanceToSquared(t))}distanceSqToSegment(t,e,n,s){oa.copy(t).add(e).multiplyScalar(.5),Zs.copy(e).sub(t).normalize(),Vn.copy(this.origin).sub(oa);let r=t.distanceTo(e)*.5,o=-this.direction.dot(Zs),a=Vn.dot(this.direction),l=-Vn.dot(Zs),c=Vn.lengthSq(),h=Math.abs(1-o*o),d,u,f,m;if(h>0)if(d=o*l-a,u=o*a-l,m=r*h,d>=0)if(u>=-m)if(u<=m){let v=1/h;d*=v,u*=v,f=d*(d+o*u+2*a)+u*(o*d+u+2*l)+c}else u=r,d=Math.max(0,-(o*u+a)),f=-d*d+u*(u+2*l)+c;else u=-r,d=Math.max(0,-(o*u+a)),f=-d*d+u*(u+2*l)+c;else u<=-m?(d=Math.max(0,-(-o*r+a)),u=d>0?-r:Math.min(Math.max(-r,-l),r),f=-d*d+u*(u+2*l)+c):u<=m?(d=0,u=Math.min(Math.max(-r,-l),r),f=u*(u+2*l)+c):(d=Math.max(0,-(o*r+a)),u=d>0?r:Math.min(Math.max(-r,-l),r),f=-d*d+u*(u+2*l)+c);else u=o>0?-r:r,d=Math.max(0,-(o*u+a)),f=-d*d+u*(u+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,d),s&&s.copy(oa).addScaledVector(Zs,u),f}intersectSphere(t,e){wn.subVectors(t.center,this.origin);let n=wn.dot(this.direction),s=wn.dot(wn)-n*n,r=t.radius*t.radius;if(s>r)return null;let o=Math.sqrt(r-s),a=n-o,l=n+o;return l<0?null:a<0?this.at(l,e):this.at(a,e)}intersectsSphere(t){return t.radius<0?!1:this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){let e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){let n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){let e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,s,r,o,a,l,c=1/this.direction.x,h=1/this.direction.y,d=1/this.direction.z,u=this.origin;return c>=0?(n=(t.min.x-u.x)*c,s=(t.max.x-u.x)*c):(n=(t.max.x-u.x)*c,s=(t.min.x-u.x)*c),h>=0?(r=(t.min.y-u.y)*h,o=(t.max.y-u.y)*h):(r=(t.max.y-u.y)*h,o=(t.min.y-u.y)*h),n>o||r>s||((r>n||isNaN(n))&&(n=r),(o<s||isNaN(s))&&(s=o),d>=0?(a=(t.min.z-u.z)*d,l=(t.max.z-u.z)*d):(a=(t.max.z-u.z)*d,l=(t.min.z-u.z)*d),n>l||a>s)||((a>n||n!==n)&&(n=a),(l<s||s!==s)&&(s=l),s<0)?null:this.at(n>=0?n:s,e)}intersectsBox(t){return this.intersectBox(t,wn)!==null}intersectTriangle(t,e,n,s,r){aa.subVectors(e,t),Js.subVectors(n,t),la.crossVectors(aa,Js);let o=this.direction.dot(la),a;if(o>0){if(s)return null;a=1}else if(o<0)a=-1,o=-o;else return null;Vn.subVectors(this.origin,t);let l=a*this.direction.dot(Js.crossVectors(Vn,Js));if(l<0)return null;let c=a*this.direction.dot(aa.cross(Vn));if(c<0||l+c>o)return null;let h=-a*Vn.dot(la);return h<0?null:this.at(h/o,r)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},nn=class extends Xn{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new zt(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Cn,this.combine=Aa,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}},zl=new ue,si=new ms,Ks=new Vi,Vl=new N,js=new N,Qs=new N,tr=new N,ca=new N,er=new N,kl=new N,nr=new N,ge=class extends Le{constructor(t=new ze,e=new nn){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let s=e[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=s.length;r<o;r++){let a=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}getVertexPosition(t,e){let n=this.geometry,s=n.attributes.position,r=n.morphAttributes.position,o=n.morphTargetsRelative;e.fromBufferAttribute(s,t);let a=this.morphTargetInfluences;if(r&&a){er.set(0,0,0);for(let l=0,c=r.length;l<c;l++){let h=a[l],d=r[l];h!==0&&(ca.fromBufferAttribute(d,t),o?er.addScaledVector(ca,h):er.addScaledVector(ca.sub(e),h))}e.add(er)}return e}raycast(t,e){let n=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),Ks.copy(n.boundingSphere),Ks.applyMatrix4(r),si.copy(t.ray).recast(t.near),!(Ks.containsPoint(si.origin)===!1&&(si.intersectSphere(Ks,Vl)===null||si.origin.distanceToSquared(Vl)>(t.far-t.near)**2))&&(zl.copy(r).invert(),si.copy(t.ray).applyMatrix4(zl),!(n.boundingBox!==null&&si.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,si)))}_computeIntersections(t,e,n){let s,r=this.geometry,o=this.material,a=r.index,l=r.attributes.position,c=r.attributes.uv,h=r.attributes.uv1,d=r.attributes.normal,u=r.groups,f=r.drawRange;if(a!==null)if(Array.isArray(o))for(let m=0,v=u.length;m<v;m++){let g=u[m],p=o[g.materialIndex],A=Math.max(g.start,f.start),w=Math.min(a.count,Math.min(g.start+g.count,f.start+f.count));for(let M=A,y=w;M<y;M+=3){let S=a.getX(M),C=a.getX(M+1),_=a.getX(M+2);s=ir(this,p,t,n,c,h,d,S,C,_),s&&(s.faceIndex=Math.floor(M/3),s.face.materialIndex=g.materialIndex,e.push(s))}}else{let m=Math.max(0,f.start),v=Math.min(a.count,f.start+f.count);for(let g=m,p=v;g<p;g+=3){let A=a.getX(g),w=a.getX(g+1),M=a.getX(g+2);s=ir(this,o,t,n,c,h,d,A,w,M),s&&(s.faceIndex=Math.floor(g/3),e.push(s))}}else if(l!==void 0)if(Array.isArray(o))for(let m=0,v=u.length;m<v;m++){let g=u[m],p=o[g.materialIndex],A=Math.max(g.start,f.start),w=Math.min(l.count,Math.min(g.start+g.count,f.start+f.count));for(let M=A,y=w;M<y;M+=3){let S=M,C=M+1,_=M+2;s=ir(this,p,t,n,c,h,d,S,C,_),s&&(s.faceIndex=Math.floor(M/3),s.face.materialIndex=g.materialIndex,e.push(s))}}else{let m=Math.max(0,f.start),v=Math.min(l.count,f.start+f.count);for(let g=m,p=v;g<p;g+=3){let A=g,w=g+1,M=g+2;s=ir(this,o,t,n,c,h,d,A,w,M),s&&(s.faceIndex=Math.floor(g/3),e.push(s))}}}};function du(i,t,e,n,s,r,o,a){let l;if(t.side===Ae?l=n.intersectTriangle(o,r,s,!0,a):l=n.intersectTriangle(s,r,o,t.side===An,a),l===null)return null;nr.copy(a),nr.applyMatrix4(i.matrixWorld);let c=e.ray.origin.distanceTo(nr);return c<e.near||c>e.far?null:{distance:c,point:nr.clone(),object:i}}function ir(i,t,e,n,s,r,o,a,l,c){i.getVertexPosition(a,js),i.getVertexPosition(l,Qs),i.getVertexPosition(c,tr);let h=du(i,t,e,n,js,Qs,tr,kl);if(h){let d=new N;Hn.getBarycoord(kl,js,Qs,tr,d),s&&(h.uv=Hn.getInterpolatedAttribute(s,a,l,c,d,new Jt)),r&&(h.uv1=Hn.getInterpolatedAttribute(r,a,l,c,d,new Jt)),o&&(h.normal=Hn.getInterpolatedAttribute(o,a,l,c,d,new N),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));let u={a,b:l,c,normal:new N,materialIndex:0};Hn.getNormal(js,Qs,tr,u.normal),h.face=u,h.barycoord=d}return h}var Er=class extends Be{constructor(t=null,e=1,n=1,s,r,o,a,l,c=we,h=we,d,u){super(null,o,a,l,c,h,s,r,d,u),this.isDataTexture=!0,this.image={data:t,width:e,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var ha=new N,fu=new N,pu=new Bt,Ze=class{constructor(t=new N(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,s){return this.normal.set(t,e,n),this.constant=s,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){let s=ha.subVectors(n,e).cross(fu.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(s,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){let t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e,n=!0){let s=t.delta(ha),r=this.normal.dot(s);if(r===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;let o=-(t.start.dot(this.normal)+this.constant)/r;return n===!0&&(o<0||o>1)?null:e.copy(t.start).addScaledVector(s,o)}intersectsLine(t){let e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){let n=e||pu.getNormalMatrix(t),s=this.coplanarPoint(ha).applyMatrix4(t),r=this.normal.applyMatrix3(n).normalize();return this.constant=-s.dot(r),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}},ri=new Vi,mu=new Jt(.5,.5),sr=new N,ki=class{constructor(t=new Ze,e=new Ze,n=new Ze,s=new Ze,r=new Ze,o=new Ze){this.planes=[t,e,n,s,r,o]}set(t,e,n,s,r,o){let a=this.planes;return a[0].copy(t),a[1].copy(e),a[2].copy(n),a[3].copy(s),a[4].copy(r),a[5].copy(o),this}copy(t){let e=this.planes;for(let n=0;n<6;n++)e[n].copy(t.planes[n]);return this}setFromProjectionMatrix(t,e=en,n=!1){let s=this.planes,r=t.elements,o=r[0],a=r[1],l=r[2],c=r[3],h=r[4],d=r[5],u=r[6],f=r[7],m=r[8],v=r[9],g=r[10],p=r[11],A=r[12],w=r[13],M=r[14],y=r[15];if(s[0].setComponents(c-o,f-h,p-m,y-A).normalize(),s[1].setComponents(c+o,f+h,p+m,y+A).normalize(),s[2].setComponents(c+a,f+d,p+v,y+w).normalize(),s[3].setComponents(c-a,f-d,p-v,y-w).normalize(),n)s[4].setComponents(l,u,g,M).normalize(),s[5].setComponents(c-l,f-u,p-g,y-M).normalize();else if(s[4].setComponents(c-l,f-u,p-g,y-M).normalize(),e===en)s[5].setComponents(c+l,f+u,p+g,y+M).normalize();else if(e===Ni)s[5].setComponents(l,u,g,M).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+e);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),ri.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{let e=t.geometry;e.boundingSphere===null&&e.computeBoundingSphere(),ri.copy(e.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(ri)}intersectsSprite(t){ri.center.set(0,0,0);let e=mu.distanceTo(t.center);return ri.radius=.7071067811865476+e,ri.applyMatrix4(t.matrixWorld),this.intersectsSphere(ri)}intersectsSphere(t){let e=this.planes,n=t.center,s=-t.radius;for(let r=0;r<6;r++)if(e[r].distanceToPoint(n)<s)return!1;return!0}intersectsBox(t){let e=this.planes;for(let n=0;n<6;n++){let s=e[n];if(sr.x=s.normal.x>0?t.max.x:t.min.x,sr.y=s.normal.y>0?t.max.y:t.min.y,sr.z=s.normal.z>0?t.max.z:t.min.z,s.distanceToPoint(sr)<0)return!1}return!0}containsPoint(t){let e=this.planes;for(let n=0;n<6;n++)if(e[n].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};var gs=class extends Be{constructor(t=[],e=Zn,n,s,r,o,a,l,c,h){super(t,e,n,s,r,o,a,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}};var Rn=class extends Be{constructor(t,e,n=rn,s,r,o,a=we,l=we,c,h=fn,d=1){if(h!==fn&&h!==Kn)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");let u={width:t,height:e,depth:d};super(u,s,r,o,a,l,h,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.source=new Oi(Object.assign({},t.image)),this.compareFunction=t.compareFunction,this}toJSON(t){let e=super.toJSON(t);return this.compareFunction!==null&&(e.compareFunction=this.compareFunction),e}},wr=class extends Rn{constructor(t,e=rn,n=Zn,s,r,o=we,a=we,l,c=fn){let h={width:t,height:t,depth:1},d=[h,h,h,h,h,h];super(t,t,e,n,s,r,o,a,l,c),this.image=d,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(t){this.image=t}},xs=class extends Be{constructor(t=null){super(),this.sourceTexture=t,this.isExternalTexture=!0}copy(t){return super.copy(t),this.sourceTexture=t.sourceTexture,this}},Hi=class i extends ze{constructor(t=1,e=1,n=1,s=1,r=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:e,depth:n,widthSegments:s,heightSegments:r,depthSegments:o};let a=this;s=Math.floor(s),r=Math.floor(r),o=Math.floor(o);let l=[],c=[],h=[],d=[],u=0,f=0;m("z","y","x",-1,-1,n,e,t,o,r,0),m("z","y","x",1,-1,n,e,-t,o,r,1),m("x","z","y",1,1,t,n,e,s,o,2),m("x","z","y",1,-1,t,n,-e,s,o,3),m("x","y","z",1,-1,t,e,n,s,r,4),m("x","y","z",-1,-1,t,e,-n,s,r,5),this.setIndex(l),this.setAttribute("position",new Ee(c,3)),this.setAttribute("normal",new Ee(h,3)),this.setAttribute("uv",new Ee(d,2));function m(v,g,p,A,w,M,y,S,C,_,E){let R=M/C,I=y/_,L=M/2,Y=y/2,q=S/2,O=C+1,z=_+1,k=0,$=0,et=new N;for(let rt=0;rt<z;rt++){let ot=rt*I-Y;for(let _t=0;_t<O;_t++){let Vt=_t*R-L;et[v]=Vt*A,et[g]=ot*w,et[p]=q,c.push(et.x,et.y,et.z),et[v]=0,et[g]=0,et[p]=S>0?1:-1,h.push(et.x,et.y,et.z),d.push(_t/C),d.push(1-rt/_),k+=1}}for(let rt=0;rt<_;rt++)for(let ot=0;ot<C;ot++){let _t=u+ot+O*rt,Vt=u+ot+O*(rt+1),te=u+(ot+1)+O*(rt+1),$t=u+(ot+1)+O*rt;l.push(_t,Vt,$t),l.push(Vt,te,$t),$+=6}a.addGroup(f,$,E),f+=$,u+=k}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}};var _s=class i extends ze{constructor(t=1,e=1,n=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:e,widthSegments:n,heightSegments:s};let r=t/2,o=e/2,a=Math.floor(n),l=Math.floor(s),c=a+1,h=l+1,d=t/a,u=e/l,f=[],m=[],v=[],g=[];for(let p=0;p<h;p++){let A=p*u-o;for(let w=0;w<c;w++){let M=w*d-r;m.push(M,-A,0),v.push(0,0,1),g.push(w/a),g.push(1-p/l)}}for(let p=0;p<l;p++)for(let A=0;A<a;A++){let w=A+c*p,M=A+c*(p+1),y=A+1+c*(p+1),S=A+1+c*p;f.push(w,M,S),f.push(M,y,S)}this.setIndex(f),this.setAttribute("position",new Ee(m,3)),this.setAttribute("normal",new Ee(v,3)),this.setAttribute("uv",new Ee(g,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.width,t.height,t.widthSegments,t.heightSegments)}},Gi=class i extends ze{constructor(t=.5,e=1,n=32,s=1,r=0,o=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:t,outerRadius:e,thetaSegments:n,phiSegments:s,thetaStart:r,thetaLength:o},n=Math.max(3,n),s=Math.max(1,s);let a=[],l=[],c=[],h=[],d=t,u=(e-t)/s,f=new N,m=new Jt;for(let v=0;v<=s;v++){for(let g=0;g<=n;g++){let p=r+g/n*o;f.x=d*Math.cos(p),f.y=d*Math.sin(p),l.push(f.x,f.y,f.z),c.push(0,0,1),m.x=(f.x/e+1)/2,m.y=(f.y/e+1)/2,h.push(m.x,m.y)}d+=u}for(let v=0;v<s;v++){let g=v*(n+1);for(let p=0;p<n;p++){let A=p+g,w=A,M=A+n+1,y=A+n+2,S=A+1;a.push(w,M,S),a.push(M,y,S)}}this.setIndex(a),this.setAttribute("position",new Ee(l,3)),this.setAttribute("normal",new Ee(c,3)),this.setAttribute("uv",new Ee(h,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.innerRadius,t.outerRadius,t.thetaSegments,t.phiSegments,t.thetaStart,t.thetaLength)}};var hi=class i extends ze{constructor(t=1,e=32,n=16,s=0,r=Math.PI*2,o=0,a=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:t,widthSegments:e,heightSegments:n,phiStart:s,phiLength:r,thetaStart:o,thetaLength:a},e=Math.max(3,Math.floor(e)),n=Math.max(2,Math.floor(n));let l=Math.min(o+a,Math.PI),c=0,h=[],d=new N,u=new N,f=[],m=[],v=[],g=[];for(let p=0;p<=n;p++){let A=[],w=p/n,M=o+w*a,y=t*Math.cos(M),S=Math.sqrt(t*t-y*y),C=0;p===0&&o===0?C=.5/e:p===n&&l===Math.PI&&(C=-.5/e);for(let _=0;_<=e;_++){let E=_/e,R=s+E*r;d.x=-S*Math.cos(R),d.y=y,d.z=S*Math.sin(R),m.push(d.x,d.y,d.z),u.copy(d).normalize(),v.push(u.x,u.y,u.z),g.push(E+C,1-w),A.push(c++)}h.push(A)}for(let p=0;p<n;p++)for(let A=0;A<e;A++){let w=h[p][A+1],M=h[p][A],y=h[p+1][A],S=h[p+1][A+1];(p!==0||o>0)&&f.push(w,M,S),(p!==n-1||l<Math.PI)&&f.push(M,y,S)}this.setIndex(f),this.setAttribute("position",new Ee(m,3)),this.setAttribute("normal",new Ee(v,3)),this.setAttribute("uv",new Ee(g,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}};function di(i){let t={};for(let e in i){t[e]={};for(let n in i[e]){let s=i[e][n];if(Hl(s))s.isRenderTargetTexture?(Nt("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=s.clone();else if(Array.isArray(s))if(Hl(s[0])){let r=[];for(let o=0,a=s.length;o<a;o++)r[o]=s[o].clone();t[e][n]=r}else t[e][n]=s.slice();else t[e][n]=s}}return t}function De(i){let t={};for(let e=0;e<i.length;e++){let n=di(i[e]);for(let s in n)t[s]=n[s]}return t}function Hl(i){return i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)}function gu(i){let t=[];for(let e=0;e<i.length;e++)t.push(i[e].clone());return t}function qa(i){let t=i.getRenderTarget();return t===null?i.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:Kt.workingColorSpace}var Lc={clone:di,merge:De},xu=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,_u=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,Ue=class extends Xn{constructor(t){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=xu,this.fragmentShader=_u,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=di(t.uniforms),this.uniformsGroups=gu(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this.defaultAttributeValues=Object.assign({},t.defaultAttributeValues),this.index0AttributeName=t.index0AttributeName,this.uniformsNeedUpdate=t.uniformsNeedUpdate,this}toJSON(t){let e=super.toJSON(t);e.glslVersion=this.glslVersion,e.uniforms={};for(let s in this.uniforms){let o=this.uniforms[s].value;o&&o.isTexture?e.uniforms[s]={type:"t",value:o.toJSON(t).uuid}:o&&o.isColor?e.uniforms[s]={type:"c",value:o.getHex()}:o&&o.isVector2?e.uniforms[s]={type:"v2",value:o.toArray()}:o&&o.isVector3?e.uniforms[s]={type:"v3",value:o.toArray()}:o&&o.isVector4?e.uniforms[s]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?e.uniforms[s]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?e.uniforms[s]={type:"m4",value:o.toArray()}:e.uniforms[s]={value:o}}Object.keys(this.defines).length>0&&(e.defines=this.defines),e.vertexShader=this.vertexShader,e.fragmentShader=this.fragmentShader,e.lights=this.lights,e.clipping=this.clipping;let n={};for(let s in this.extensions)this.extensions[s]===!0&&(n[s]=!0);return Object.keys(n).length>0&&(e.extensions=n),e}fromJSON(t,e){if(super.fromJSON(t,e),t.uniforms!==void 0)for(let n in t.uniforms){let s=t.uniforms[n];switch(this.uniforms[n]={},s.type){case"t":this.uniforms[n].value=e[s.value]||null;break;case"c":this.uniforms[n].value=new zt().setHex(s.value);break;case"v2":this.uniforms[n].value=new Jt().fromArray(s.value);break;case"v3":this.uniforms[n].value=new N().fromArray(s.value);break;case"v4":this.uniforms[n].value=new de().fromArray(s.value);break;case"m3":this.uniforms[n].value=new Bt().fromArray(s.value);break;case"m4":this.uniforms[n].value=new ue().fromArray(s.value);break;default:this.uniforms[n].value=s.value}}if(t.defines!==void 0&&(this.defines=t.defines),t.vertexShader!==void 0&&(this.vertexShader=t.vertexShader),t.fragmentShader!==void 0&&(this.fragmentShader=t.fragmentShader),t.glslVersion!==void 0&&(this.glslVersion=t.glslVersion),t.extensions!==void 0)for(let n in t.extensions)this.extensions[n]=t.extensions[n];return t.lights!==void 0&&(this.lights=t.lights),t.clipping!==void 0&&(this.clipping=t.clipping),this}},Tr=class extends Ue{constructor(t){super(t),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}},Wi=class extends Xn{constructor(t){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new zt(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new zt(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Ao,this.normalScale=new Jt(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Cn,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.defines={STANDARD:""},this.color.copy(t.color),this.roughness=t.roughness,this.metalness=t.metalness,this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.roughnessMap=t.roughnessMap,this.metalnessMap=t.metalnessMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.envMapIntensity=t.envMapIntensity,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}};var Ar=class extends Xn{constructor(t){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=vc,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}},Cr=class extends Xn{constructor(t){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}};function rr(i,t){return!i||i.constructor===t?i:typeof t.BYTES_PER_ELEMENT=="number"?new t(i):Array.prototype.slice.call(i)}var Yn=class{constructor(t,e,n,s){this.parameterPositions=t,this._cachedIndex=0,this.resultBuffer=s!==void 0?s:new e.constructor(n),this.sampleValues=e,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(t){let e=this.parameterPositions,n=this._cachedIndex,s=e[n],r=e[n-1];n:{t:{let o;e:{i:if(!(t<s)){for(let a=n+2;;){if(s===void 0){if(t<r)break i;return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(r=s,s=e[++n],t<s)break t}o=e.length;break e}if(!(t>=r)){let a=e[1];t<a&&(n=2,r=a);for(let l=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(s=r,r=e[--n-1],t>=r)break t}o=n,n=0;break e}break n}for(;n<o;){let a=n+o>>>1;t<e[a]?o=a:n=a+1}if(s=e[n],r=e[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(s===void 0)return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,s)}return this.interpolate_(n,r,t,s)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(t){let e=this.resultBuffer,n=this.sampleValues,s=this.valueSize,r=t*s;for(let o=0;o!==s;++o)e[o]=n[r+o];return e}interpolate_(){throw new Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}},Rr=class extends Yn{constructor(t,e,n,s){super(t,e,n,s),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:fa,endingEnd:fa}}intervalChanged_(t,e,n){let s=this.parameterPositions,r=t-2,o=t+1,a=s[r],l=s[o];if(a===void 0)switch(this.getSettings_().endingStart){case pa:r=t,a=2*e-n;break;case ma:r=s.length-2,a=e+s[r]-s[r+1];break;default:r=t,a=n}if(l===void 0)switch(this.getSettings_().endingEnd){case pa:o=t,l=2*n-e;break;case ma:o=1,l=n+s[1]-s[0];break;default:o=t-1,l=e}let c=(n-e)*.5,h=this.valueSize;this._weightPrev=c/(e-a),this._weightNext=c/(l-n),this._offsetPrev=r*h,this._offsetNext=o*h}interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=t*a,c=l-a,h=this._offsetPrev,d=this._offsetNext,u=this._weightPrev,f=this._weightNext,m=(n-e)/(s-e),v=m*m,g=v*m,p=-u*g+2*u*v-u*m,A=(1+u)*g+(-1.5-2*u)*v+(-.5+u)*m+1,w=(-1-f)*g+(1.5+f)*v+.5*m,M=f*g-f*v;for(let y=0;y!==a;++y)r[y]=p*o[h+y]+A*o[c+y]+w*o[l+y]+M*o[d+y];return r}},Ir=class extends Yn{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=t*a,c=l-a,h=(n-e)/(s-e),d=1-h;for(let u=0;u!==a;++u)r[u]=o[c+u]*d+o[l+u]*h;return r}},Pr=class extends Yn{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t){return this.copySampleValue_(t-1)}},Lr=class extends Yn{interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=t*a,c=l-a,h=this.inTangents,d=this.outTangents;if(!h||!d){let m=(n-e)/(s-e),v=1-m;for(let g=0;g!==a;++g)r[g]=o[c+g]*v+o[l+g]*m;return r}let u=a*2,f=t-1;for(let m=0;m!==a;++m){let v=o[c+m],g=o[l+m],p=f*u+m*2,A=d[p],w=d[p+1],M=t*u+m*2,y=h[M],S=h[M+1],C=(n-e)/(s-e),_,E,R,I,L;for(let Y=0;Y<8;Y++){_=C*C,E=_*C,R=1-C,I=R*R,L=I*R;let O=L*e+3*I*C*A+3*R*_*y+E*s-n;if(Math.abs(O)<1e-10)break;let z=3*I*(A-e)+6*R*C*(y-A)+3*_*(s-y);if(Math.abs(z)<1e-10)break;C=C-O/z,C=Math.max(0,Math.min(1,C))}r[m]=L*v+3*I*C*w+3*R*_*S+E*g}return r}},Ye=class{constructor(t,e,n,s){if(t===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(e===void 0||e.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+t);this.name=t,this.times=rr(e,this.TimeBufferType),this.values=rr(n,this.ValueBufferType),this.setInterpolation(s||this.DefaultInterpolation)}static toJSON(t){let e=t.constructor,n;if(e.toJSON!==this.toJSON)n=e.toJSON(t);else{n={name:t.name,times:rr(t.times,Array),values:rr(t.values,Array)};let s=t.getInterpolation();s!==t.DefaultInterpolation&&(n.interpolation=s)}return n.type=t.ValueTypeName,n}InterpolantFactoryMethodDiscrete(t){return new Pr(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodLinear(t){return new Ir(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodSmooth(t){return new Rr(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodBezier(t){let e=new Lr(this.times,this.values,this.getValueSize(),t);return this.settings&&(e.inTangents=this.settings.inTangents,e.outTangents=this.settings.outTangents),e}setInterpolation(t){let e;switch(t){case os:e=this.InterpolantFactoryMethodDiscrete;break;case yr:e=this.InterpolantFactoryMethodLinear;break;case lr:e=this.InterpolantFactoryMethodSmooth;break;case da:e=this.InterpolantFactoryMethodBezier;break}if(e===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(t!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return Nt("KeyframeTrack:",n),this}return this.createInterpolant=e,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return os;case this.InterpolantFactoryMethodLinear:return yr;case this.InterpolantFactoryMethodSmooth:return lr;case this.InterpolantFactoryMethodBezier:return da}}getValueSize(){return this.values.length/this.times.length}shift(t){if(t!==0){let e=this.times;for(let n=0,s=e.length;n!==s;++n)e[n]+=t}return this}scale(t){if(t!==1){let e=this.times;for(let n=0,s=e.length;n!==s;++n)e[n]*=t}return this}trim(t,e){let n=this.times,s=n.length,r=0,o=s-1;for(;r!==s&&n[r]<t;)++r;for(;o!==-1&&n[o]>e;)--o;if(++o,r!==0||o!==s){r>=o&&(o=Math.max(o,1),r=o-1);let a=this.getValueSize();this.times=n.slice(r,o),this.values=this.values.slice(r*a,o*a)}return this}validate(){let t=!0,e=this.getValueSize();e-Math.floor(e)!==0&&(Ft("KeyframeTrack: Invalid value size in track.",this),t=!1);let n=this.times,s=this.values,r=n.length;r===0&&(Ft("KeyframeTrack: Track is empty.",this),t=!1);let o=null;for(let a=0;a!==r;a++){let l=n[a];if(typeof l=="number"&&isNaN(l)){Ft("KeyframeTrack: Time is not a valid number.",this,a,l),t=!1;break}if(o!==null&&o>l){Ft("KeyframeTrack: Out of order keys.",this,a,l,o),t=!1;break}o=l}if(s!==void 0&&Uh(s))for(let a=0,l=s.length;a!==l;++a){let c=s[a];if(isNaN(c)){Ft("KeyframeTrack: Value is not a valid number.",this,a,c),t=!1;break}}return t}optimize(){let t=this.times.slice(),e=this.values.slice(),n=this.getValueSize(),s=this.getInterpolation()===lr,r=t.length-1,o=1;for(let a=1;a<r;++a){let l=!1,c=t[a],h=t[a+1];if(c!==h&&(a!==1||c!==t[0]))if(s)l=!0;else{let d=a*n,u=d-n,f=d+n;for(let m=0;m!==n;++m){let v=e[d+m];if(v!==e[u+m]||v!==e[f+m]){l=!0;break}}}if(l){if(a!==o){t[o]=t[a];let d=a*n,u=o*n;for(let f=0;f!==n;++f)e[u+f]=e[d+f]}++o}}if(r>0){t[o]=t[r];for(let a=r*n,l=o*n,c=0;c!==n;++c)e[l+c]=e[a+c];++o}return o!==t.length?(this.times=t.slice(0,o),this.values=e.slice(0,o*n)):(this.times=t,this.values=e),this}clone(){let t=this.times.slice(),e=this.values.slice(),n=this.constructor,s=new n(this.name,t,e);return s.createInterpolant=this.createInterpolant,s}};Ye.prototype.ValueTypeName="";Ye.prototype.TimeBufferType=Float32Array;Ye.prototype.ValueBufferType=Float32Array;Ye.prototype.DefaultInterpolation=yr;var qn=class extends Ye{constructor(t,e,n){super(t,e,n)}};qn.prototype.ValueTypeName="bool";qn.prototype.ValueBufferType=Array;qn.prototype.DefaultInterpolation=os;qn.prototype.InterpolantFactoryMethodLinear=void 0;qn.prototype.InterpolantFactoryMethodSmooth=void 0;var Dr=class extends Ye{constructor(t,e,n,s){super(t,e,n,s)}};Dr.prototype.ValueTypeName="color";var Nr=class extends Ye{constructor(t,e,n,s){super(t,e,n,s)}};Nr.prototype.ValueTypeName="number";var Ur=class extends Yn{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=(n-e)/(s-e),c=t*a;for(let h=c+a;c!==h;c+=4)mn.slerpFlat(r,0,o,c-a,o,c,l);return r}},vs=class extends Ye{constructor(t,e,n,s){super(t,e,n,s)}InterpolantFactoryMethodLinear(t){return new Ur(this.times,this.values,this.getValueSize(),t)}};vs.prototype.ValueTypeName="quaternion";vs.prototype.InterpolantFactoryMethodSmooth=void 0;var $n=class extends Ye{constructor(t,e,n){super(t,e,n)}};$n.prototype.ValueTypeName="string";$n.prototype.ValueBufferType=Array;$n.prototype.DefaultInterpolation=os;$n.prototype.InterpolantFactoryMethodLinear=void 0;$n.prototype.InterpolantFactoryMethodSmooth=void 0;var Fr=class extends Ye{constructor(t,e,n,s){super(t,e,n,s)}};Fr.prototype.ValueTypeName="vector";var Or=class{constructor(t,e,n){let s=this,r=!1,o=0,a=0,l,c=[];this.onStart=void 0,this.onLoad=t,this.onProgress=e,this.onError=n,this._abortController=null,this.itemStart=function(h){a++,r===!1&&s.onStart!==void 0&&s.onStart(h,o,a),r=!0},this.itemEnd=function(h){o++,s.onProgress!==void 0&&s.onProgress(h,o,a),o===a&&(r=!1,s.onLoad!==void 0&&s.onLoad())},this.itemError=function(h){s.onError!==void 0&&s.onError(h)},this.resolveURL=function(h){return h=h.normalize("NFC"),l?l(h):h},this.setURLModifier=function(h){return l=h,this},this.addHandler=function(h,d){return c.push(h,d),this},this.removeHandler=function(h){let d=c.indexOf(h);return d!==-1&&c.splice(d,2),this},this.getHandler=function(h){for(let d=0,u=c.length;d<u;d+=2){let f=c[d],m=c[d+1];if(f.global&&(f.lastIndex=0),f.test(h))return m}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||(this._abortController=new AbortController),this._abortController}},Dc=new Or,Br=class{constructor(t){this.manager=t!==void 0?t:Dc,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(t,e){let n=this;return new Promise(function(s,r){n.load(t,s,e,r)})}parse(){}setCrossOrigin(t){return this.crossOrigin=t,this}setWithCredentials(t){return this.withCredentials=t,this}setPath(t){return this.path=t,this}setResourcePath(t){return this.resourcePath=t,this}setRequestHeader(t){return this.requestHeader=t,this}abort(){return this}};Br.DEFAULT_MATERIAL_NAME="__DEFAULT";var ys=class extends Le{constructor(t,e=1){super(),this.isLight=!0,this.type="Light",this.color=new zt(t),this.intensity=e}dispose(){this.dispatchEvent({type:"dispose"})}copy(t,e){return super.copy(t,e),this.color.copy(t.color),this.intensity=t.intensity,this}toJSON(t){let e=super.toJSON(t);return e.object.color=this.color.getHex(),e.object.intensity=this.intensity,e}},bs=class extends ys{constructor(t,e,n){super(t,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(Le.DEFAULT_UP),this.updateMatrix(),this.groundColor=new zt(e)}copy(t,e){return super.copy(t,e),this.groundColor.copy(t.groundColor),this}toJSON(t){let e=super.toJSON(t);return e.object.groundColor=this.groundColor.getHex(),e}},ua=new ue,Gl=new N,Wl=new N,_a=class{constructor(t){this.camera=t,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new Jt(512,512),this.mapType=Ve,this.map=null,this.mapPass=null,this.matrix=new ue,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new ki,this._frameExtents=new Jt(1,1),this._viewportCount=1,this._viewports=[new de(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(t){let e=this.camera,n=this.matrix;Gl.setFromMatrixPosition(t.matrixWorld),e.position.copy(Gl),Wl.setFromMatrixPosition(t.target.matrixWorld),e.lookAt(Wl),e.updateMatrixWorld(),ua.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),this._frustum.setFromProjectionMatrix(ua,e.coordinateSystem,e.reversedDepth),e.coordinateSystem===Ni||e.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(ua)}getViewport(t){return this._viewports[t]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(t){return this.camera=t.camera.clone(),this.intensity=t.intensity,this.bias=t.bias,this.radius=t.radius,this.autoUpdate=t.autoUpdate,this.needsUpdate=t.needsUpdate,this.normalBias=t.normalBias,this.blurSamples=t.blurSamples,this.mapSize.copy(t.mapSize),this.biasNode=t.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){let t={};return this.intensity!==1&&(t.intensity=this.intensity),this.bias!==0&&(t.bias=this.bias),this.normalBias!==0&&(t.normalBias=this.normalBias),this.radius!==1&&(t.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(t.mapSize=this.mapSize.toArray()),t.camera=this.camera.toJSON(!1).object,delete t.camera.matrix,t}},or=new N,ar=new mn,un=new N,Ms=class extends Le{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new ue,this.projectionMatrix=new ue,this.projectionMatrixInverse=new ue,this.coordinateSystem=en,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(t,e){return super.copy(t,e),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorld.decompose(or,ar,un),un.x===1&&un.y===1&&un.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(or,ar,un.set(1,1,1)).invert()}updateWorldMatrix(t,e,n=!1){super.updateWorldMatrix(t,e,n),this.matrixWorld.decompose(or,ar,un),un.x===1&&un.y===1&&un.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(or,ar,un.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}},kn=new N,Xl=new Jt,Yl=new Jt,Pe=class extends Ms{constructor(t=50,e=1,n=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=n,this.far=s,this.focus=10,this.aspect=e,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){let e=.5*this.getFilmHeight()/t;this.fov=Fi*2*Math.atan(e),this.updateProjectionMatrix()}getFocalLength(){let t=Math.tan(ss*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return Fi*2*Math.atan(Math.tan(ss*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,e,n){kn.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),e.set(kn.x,kn.y).multiplyScalar(-t/kn.z),kn.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(kn.x,kn.y).multiplyScalar(-t/kn.z)}getViewSize(t,e){return this.getViewBounds(t,Xl,Yl),e.subVectors(Yl,Xl)}setViewOffset(t,e,n,s,r,o){this.aspect=t/e,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=this.near,e=t*Math.tan(ss*.5*this.fov)/this.zoom,n=2*e,s=this.aspect*n,r=-.5*s,o=this.view;if(this.view!==null&&this.view.enabled){let l=o.fullWidth,c=o.fullHeight;r+=o.offsetX*s/l,e-=o.offsetY*n/c,s*=o.width/l,n*=o.height/c}let a=this.filmOffset;a!==0&&(r+=t*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,e,e-n,t,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.fov=this.fov,e.object.zoom=this.zoom,e.object.near=this.near,e.object.far=this.far,e.object.focus=this.focus,e.object.aspect=this.aspect,this.view!==null&&(e.object.view=Object.assign({},this.view)),e.object.filmGauge=this.filmGauge,e.object.filmOffset=this.filmOffset,e}};var Xi=class extends Ms{constructor(t=-1,e=1,n=1,s=-1,r=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=e,this.top=n,this.bottom=s,this.near=r,this.far=o,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,e,n,s,r,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=(this.right-this.left)/(2*this.zoom),e=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,s=(this.top+this.bottom)/2,r=n-t,o=n+t,a=s+e,l=s-e;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,o=r+c*this.view.width,a-=h*this.view.offsetY,l=a-h*this.view.height}this.projectionMatrix.makeOrthographic(r,o,a,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.zoom=this.zoom,e.object.left=this.left,e.object.right=this.right,e.object.top=this.top,e.object.bottom=this.bottom,e.object.near=this.near,e.object.far=this.far,this.view!==null&&(e.object.view=Object.assign({},this.view)),e}},va=class extends _a{constructor(){super(new Xi(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},Yi=class extends ys{constructor(t,e){super(t,e),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(Le.DEFAULT_UP),this.updateMatrix(),this.target=new Le,this.shadow=new va}dispose(){super.dispose(),this.shadow.dispose()}copy(t){return super.copy(t),this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}toJSON(t){let e=super.toJSON(t);return e.object.shadow=this.shadow.toJSON(),e.object.target=this.target.uuid,e}};var Ii=-90,Pi=1,zr=class extends Le{constructor(t,e,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let s=new Pe(Ii,Pi,t,e);s.layers=this.layers,this.add(s);let r=new Pe(Ii,Pi,t,e);r.layers=this.layers,this.add(r);let o=new Pe(Ii,Pi,t,e);o.layers=this.layers,this.add(o);let a=new Pe(Ii,Pi,t,e);a.layers=this.layers,this.add(a);let l=new Pe(Ii,Pi,t,e);l.layers=this.layers,this.add(l);let c=new Pe(Ii,Pi,t,e);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let t=this.coordinateSystem,e=this.children.concat(),[n,s,r,o,a,l]=e;for(let c of e)this.remove(c);if(t===en)n.up.set(0,1,0),n.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(t===Ni)n.up.set(0,-1,0),n.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(let c of e)this.add(c),c.updateMatrixWorld()}update(t,e){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:s}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());let[r,o,a,l,c,h]=this.children,d=t.getRenderTarget(),u=t.getActiveCubeFace(),f=t.getActiveMipmapLevel(),m=t.xr.enabled;t.xr.enabled=!1;let v=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let g=!1;t.isWebGLRenderer===!0?g=t.state.buffers.depth.getReversed():g=t.reversedDepthBuffer,t.setRenderTarget(n,0,s),g&&t.autoClear===!1&&t.clearDepth(),t.render(e,r),t.setRenderTarget(n,1,s),g&&t.autoClear===!1&&t.clearDepth(),t.render(e,o),t.setRenderTarget(n,2,s),g&&t.autoClear===!1&&t.clearDepth(),t.render(e,a),t.setRenderTarget(n,3,s),g&&t.autoClear===!1&&t.clearDepth(),t.render(e,l),t.setRenderTarget(n,4,s),g&&t.autoClear===!1&&t.clearDepth(),t.render(e,c),n.texture.generateMipmaps=v,t.setRenderTarget(n,5,s),g&&t.autoClear===!1&&t.clearDepth(),t.render(e,h),t.setRenderTarget(d,u,f),t.xr.enabled=m,n.texture.needsPMREMUpdate=!0}},Vr=class extends Pe{constructor(t=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=t}};var $a="\\[\\]\\.:\\/",vu=new RegExp("["+$a+"]","g"),Za="[^"+$a+"]",yu="[^"+$a.replace("\\.","")+"]",bu=/((?:WC+[\/:])*)/.source.replace("WC",Za),Mu=/(WCOD+)?/.source.replace("WCOD",yu),Su=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Za),Eu=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Za),wu=new RegExp("^"+bu+Mu+Su+Eu+"$"),Tu=["material","materials","bones","map"],ya=class{constructor(t,e,n){let s=n||he.parseTrackName(e);this._targetGroup=t,this._bindings=t.subscribe_(e,s)}getValue(t,e){this.bind();let n=this._targetGroup.nCachedObjects_,s=this._bindings[n];s!==void 0&&s.getValue(t,e)}setValue(t,e){let n=this._bindings;for(let s=this._targetGroup.nCachedObjects_,r=n.length;s!==r;++s)n[s].setValue(t,e)}bind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].bind()}unbind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].unbind()}},he=class i{constructor(t,e,n){this.path=e,this.parsedPath=n||i.parseTrackName(e),this.node=i.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,e,n){return t&&t.isAnimationObjectGroup?new i.Composite(t,e,n):new i(t,e,n)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace(vu,"")}static parseTrackName(t){let e=wu.exec(t);if(e===null)throw new Error("THREE.PropertyBinding: Cannot parse trackName: "+t);let n={nodeName:e[2],objectName:e[3],objectIndex:e[4],propertyName:e[5],propertyIndex:e[6]},s=n.nodeName&&n.nodeName.lastIndexOf(".");if(s!==void 0&&s!==-1){let r=n.nodeName.substring(s+1);Tu.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,s),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+t);return n}static findNode(t,e){if(e===void 0||e===""||e==="."||e===-1||e===t.name||e===t.uuid)return t;if(t.skeleton){let n=t.skeleton.getBoneByName(e);if(n!==void 0)return n}if(t.children){let n=function(r){for(let o=0;o<r.length;o++){let a=r[o];if(a.name===e||a.uuid===e)return a;let l=n(a.children);if(l)return l}return null},s=n(t.children);if(s)return s}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,e){t[e]=this.targetObject[this.propertyName]}_getValue_array(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)t[e++]=n[s]}_getValue_arrayElement(t,e){t[e]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,e){this.resolvedProperty.toArray(t,e)}_setValue_direct(t,e){this.targetObject[this.propertyName]=t[e]}_setValue_direct_setNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++]}_setValue_array_setNeedsUpdate(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,e){this.resolvedProperty[this.propertyIndex]=t[e]}_setValue_arrayElement_setNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,e){this.resolvedProperty.fromArray(t,e)}_setValue_fromArray_setNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,e){this.bind(),this.getValue(t,e)}_setValue_unbound(t,e){this.bind(),this.setValue(t,e)}bind(){let t=this.node,e=this.parsedPath,n=e.objectName,s=e.propertyName,r=e.propertyIndex;if(t||(t=i.findNode(this.rootNode,e.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){Nt("PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let c=e.objectIndex;switch(n){case"materials":if(!t.material){Ft("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){Ft("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){Ft("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let h=0;h<t.length;h++)if(t[h].name===c){c=h;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){Ft("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){Ft("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[n]===void 0){Ft("PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[n]}if(c!==void 0){if(t[c]===void 0){Ft("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[c]}}let o=t[s];if(o===void 0){let c=e.nodeName;Ft("PropertyBinding: Trying to update property for track: "+c+"."+s+" but it wasn't found.",t);return}let a=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?a=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(a=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(r!==void 0){if(s==="morphTargetInfluences"){if(!t.geometry){Ft("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){Ft("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[r]!==void 0&&(r=t.morphTargetDictionary[r])}l=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=r}else o.fromArray!==void 0&&o.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(l=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=s;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][a]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};he.Composite=ya;he.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};he.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};he.prototype.GetterByBindingType=[he.prototype._getValue_direct,he.prototype._getValue_array,he.prototype._getValue_arrayElement,he.prototype._getValue_toArray];he.prototype.SetterByBindingTypeAndVersioning=[[he.prototype._setValue_direct,he.prototype._setValue_direct_setNeedsUpdate,he.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[he.prototype._setValue_array,he.prototype._setValue_array_setNeedsUpdate,he.prototype._setValue_array_setMatrixWorldNeedsUpdate],[he.prototype._setValue_arrayElement,he.prototype._setValue_arrayElement_setNeedsUpdate,he.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[he.prototype._setValue_fromArray,he.prototype._setValue_fromArray_setNeedsUpdate,he.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var e0=new Float32Array(1);var ql=new ue,Ss=class{constructor(t,e,n=0,s=1/0){this.ray=new ms(t,e),this.near=n,this.far=s,this.camera=null,this.layers=new Bi,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(t,e){this.ray.set(t,e)}setFromCamera(t,e){e.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(t.x,t.y,.5).unproject(e).sub(this.ray.origin).normalize(),this.camera=e):e.isOrthographicCamera?(this.ray.origin.set(t.x,t.y,e.projectionMatrix.elements[14]).unproject(e),this.ray.direction.set(0,0,-1).transformDirection(e.matrixWorld),this.camera=e):Ft("Raycaster: Unsupported camera type: "+e.type)}setFromXRController(t){return ql.identity().extractRotation(t.matrixWorld),this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(ql),this}intersectObject(t,e=!0,n=[]){return ba(t,this,n,e),n.sort($l),n}intersectObjects(t,e=!0,n=[]){for(let s=0,r=t.length;s<r;s++)ba(t[s],this,n,e);return n.sort($l),n}};function $l(i,t){return i.distance-t.distance}function ba(i,t,e,n){let s=!0;if(i.layers.test(t.layers)&&i.raycast(t,e)===!1&&(s=!1),s===!0&&n===!0){let r=i.children;for(let o=0,a=r.length;o<a;o++)ba(r[o],t,e,!0)}}var Ma=class i{static{i.prototype.isMatrix2=!0}constructor(t,e,n,s){this.elements=[1,0,0,1],t!==void 0&&this.set(t,e,n,s)}identity(){return this.set(1,0,0,1),this}fromArray(t,e=0){for(let n=0;n<4;n++)this.elements[n]=t[n+e];return this}set(t,e,n,s){let r=this.elements;return r[0]=t,r[2]=e,r[1]=n,r[3]=s,this}};function Ja(i,t,e,n){let s=Au(n);switch(e){case Va:return i*t;case Ha:return i*t/s.components*s.byteLength;case qr:return i*t/s.components*s.byteLength;case jn:return i*t*2/s.components*s.byteLength;case $r:return i*t*2/s.components*s.byteLength;case ka:return i*t*3/s.components*s.byteLength;case Ke:return i*t*4/s.components*s.byteLength;case Zr:return i*t*4/s.components*s.byteLength;case As:case Cs:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case Rs:case Is:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case Kr:case Qr:return Math.max(i,16)*Math.max(t,8)/4;case Jr:case jr:return Math.max(i,8)*Math.max(t,8)/2;case to:case eo:case io:case so:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case no:case Ps:case ro:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case oo:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case ao:return Math.floor((i+4)/5)*Math.floor((t+3)/4)*16;case lo:return Math.floor((i+4)/5)*Math.floor((t+4)/5)*16;case co:return Math.floor((i+5)/6)*Math.floor((t+4)/5)*16;case ho:return Math.floor((i+5)/6)*Math.floor((t+5)/6)*16;case uo:return Math.floor((i+7)/8)*Math.floor((t+4)/5)*16;case fo:return Math.floor((i+7)/8)*Math.floor((t+5)/6)*16;case po:return Math.floor((i+7)/8)*Math.floor((t+7)/8)*16;case mo:return Math.floor((i+9)/10)*Math.floor((t+4)/5)*16;case go:return Math.floor((i+9)/10)*Math.floor((t+5)/6)*16;case xo:return Math.floor((i+9)/10)*Math.floor((t+7)/8)*16;case _o:return Math.floor((i+9)/10)*Math.floor((t+9)/10)*16;case vo:return Math.floor((i+11)/12)*Math.floor((t+9)/10)*16;case yo:return Math.floor((i+11)/12)*Math.floor((t+11)/12)*16;case bo:case Mo:case So:return Math.ceil(i/4)*Math.ceil(t/4)*16;case Eo:case wo:return Math.ceil(i/4)*Math.ceil(t/4)*8;case Ls:case To:return Math.ceil(i/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${e} format.`)}function Au(i){switch(i){case Ve:case Fa:return{byteLength:1,components:1};case $i:case Oa:case xn:return{byteLength:2,components:1};case Xr:case Yr:return{byteLength:2,components:4};case rn:case Wr:case on:return{byteLength:4,components:1};case Ba:case za:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${i}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"185"}}));typeof window<"u"&&(window.__THREE__?Nt("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="185");function nh(){let i=null,t=!1,e=null,n=null;function s(r,o){e(r,o),n=i.requestAnimationFrame(s)}return{start:function(){t!==!0&&e!==null&&i!==null&&(n=i.requestAnimationFrame(s),t=!0)},stop:function(){i!==null&&i.cancelAnimationFrame(n),t=!1},setAnimationLoop:function(r){e=r},setContext:function(r){i=r}}}function Ru(i){let t=new WeakMap;function e(a,l){let c=a.array,h=a.usage,d=c.byteLength,u=i.createBuffer();i.bindBuffer(l,u),i.bufferData(l,c,h),a.onUploadCallback();let f;if(c instanceof Float32Array)f=i.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)f=i.HALF_FLOAT;else if(c instanceof Uint16Array)a.isFloat16BufferAttribute?f=i.HALF_FLOAT:f=i.UNSIGNED_SHORT;else if(c instanceof Int16Array)f=i.SHORT;else if(c instanceof Uint32Array)f=i.UNSIGNED_INT;else if(c instanceof Int32Array)f=i.INT;else if(c instanceof Int8Array)f=i.BYTE;else if(c instanceof Uint8Array)f=i.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)f=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:u,type:f,bytesPerElement:c.BYTES_PER_ELEMENT,version:a.version,size:d}}function n(a,l,c){let h=l.array,d=l.updateRanges;if(i.bindBuffer(c,a),d.length===0)i.bufferSubData(c,0,h);else{d.sort((f,m)=>f.start-m.start);let u=0;for(let f=1;f<d.length;f++){let m=d[u],v=d[f];v.start<=m.start+m.count+1?m.count=Math.max(m.count,v.start+v.count-m.start):(++u,d[u]=v)}d.length=u+1;for(let f=0,m=d.length;f<m;f++){let v=d[f];i.bufferSubData(c,v.start*h.BYTES_PER_ELEMENT,h,v.start,v.count)}l.clearUpdateRanges()}l.onUploadCallback()}function s(a){return a.isInterleavedBufferAttribute&&(a=a.data),t.get(a)}function r(a){a.isInterleavedBufferAttribute&&(a=a.data);let l=t.get(a);l&&(i.deleteBuffer(l.buffer),t.delete(a))}function o(a,l){if(a.isInterleavedBufferAttribute&&(a=a.data),a.isGLBufferAttribute){let h=t.get(a);(!h||h.version<a.version)&&t.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}let c=t.get(a);if(c===void 0)t.set(a,e(a,l));else if(c.version<a.version){if(c.size!==a.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,a,l),c.version=a.version}}return{get:s,remove:r,update:o}}var Iu=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Pu=`#ifdef USE_ALPHAHASH
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
#endif`,Lu=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,Du=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Nu=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,Uu=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,Fu=`#ifdef USE_AOMAP
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
#endif`,Ou=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,Bu=`#ifdef USE_BATCHING
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
#endif`,zu=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Vu=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,ku=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,Hu=`float G_BlinnPhong_Implicit( ) {
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
} // validated`,Gu=`#ifdef USE_IRIDESCENCE
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
#endif`,Wu=`#ifdef USE_BUMPMAP
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
#endif`,Xu=`#if NUM_CLIPPING_PLANES > 0
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
#endif`,Yu=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,qu=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,$u=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,Zu=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,Ju=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,Ku=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,ju=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
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
#endif`,Qu=`#define PI 3.141592653589793
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
} // validated`,td=`#ifdef ENVMAP_TYPE_CUBE_UV
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
#endif`,ed=`vec3 transformedNormal = objectNormal;
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
#endif`,nd=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,id=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,sd=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,rd=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,od="gl_FragColor = linearToOutputTexel( gl_FragColor );",ad=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,ld=`#ifdef USE_ENVMAP
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
#endif`,cd=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,hd=`#ifdef USE_ENVMAP
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
#endif`,ud=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,dd=`#ifdef USE_ENVMAP
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
#endif`,fd=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,pd=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,md=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,gd=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,xd=`#ifdef USE_GRADIENTMAP
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
}`,_d=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,vd=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,yd=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,bd=`uniform bool receiveShadow;
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
#include <lightprobes_pars_fragment>`,Md=`#ifdef USE_ENVMAP
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
#endif`,Sd=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Ed=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,wd=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Td=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Ad=`PhysicalMaterial material;
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
#endif`,Cd=`uniform sampler2D dfgLUT;
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
}`,Rd=`
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
#endif`,Id=`#if defined( RE_IndirectDiffuse )
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
#endif`,Pd=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Ld=`#ifdef USE_LIGHT_PROBES_GRID
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
#endif`,Dd=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,Nd=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Ud=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Fd=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,Od=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,Bd=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,zd=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
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
#endif`,Vd=`#if defined( USE_POINTS_UV )
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
#endif`,kd=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,Hd=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,Gd=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,Wd=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,Xd=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Yd=`#ifdef USE_MORPHTARGETS
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
#endif`,qd=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,$d=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
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
vec3 nonPerturbedNormal = normal;`,Zd=`#ifdef USE_NORMALMAP_OBJECTSPACE
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
#endif`,Jd=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Kd=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,jd=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,Qd=`#ifdef USE_NORMALMAP
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
#endif`,tf=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,ef=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,nf=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,sf=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,rf=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,of=`vec3 packNormalToRGB( const in vec3 normal ) {
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
}`,af=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,lf=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,cf=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,hf=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,uf=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,df=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,ff=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,pf=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,mf=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
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
#endif`,gf=`float getShadowMask() {
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
}`,xf=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,_f=`#ifdef USE_SKINNING
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
#endif`,vf=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,yf=`#ifdef USE_SKINNING
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
#endif`,bf=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,Mf=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,Sf=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Ef=`#ifndef saturate
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
vec3 CustomToneMapping( vec3 color ) { return color; }`,wf=`#ifdef USE_TRANSMISSION
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
#endif`,Tf=`#ifdef USE_TRANSMISSION
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
#endif`,Af=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Cf=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Rf=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,If=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,Pf=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,Lf=`uniform sampler2D t2D;
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
}`,Df=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Nf=`#ifdef ENVMAP_TYPE_CUBE
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
}`,Uf=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Ff=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Of=`#include <common>
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
}`,Bf=`#if DEPTH_PACKING == 3200
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
}`,zf=`#define DISTANCE
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
}`,Vf=`#define DISTANCE
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
}`,kf=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,Hf=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Gf=`uniform float scale;
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
}`,Wf=`uniform vec3 diffuse;
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
}`,Xf=`#include <common>
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
}`,Yf=`uniform vec3 diffuse;
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
}`,qf=`#define LAMBERT
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
}`,$f=`#define LAMBERT
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
}`,Zf=`#define MATCAP
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
}`,Jf=`#define MATCAP
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
}`,Kf=`#define NORMAL
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
}`,jf=`#define NORMAL
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
}`,Qf=`#define PHONG
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
}`,tp=`#define PHONG
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
}`,ep=`#define STANDARD
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
}`,np=`#define STANDARD
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
}`,ip=`#define TOON
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
}`,sp=`#define TOON
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
}`,rp=`uniform float size;
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
}`,op=`uniform vec3 diffuse;
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
}`,ap=`#include <common>
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
}`,lp=`uniform vec3 color;
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
}`,cp=`uniform float rotation;
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
}`,hp=`uniform vec3 diffuse;
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
}`,qt={alphahash_fragment:Iu,alphahash_pars_fragment:Pu,alphamap_fragment:Lu,alphamap_pars_fragment:Du,alphatest_fragment:Nu,alphatest_pars_fragment:Uu,aomap_fragment:Fu,aomap_pars_fragment:Ou,batching_pars_vertex:Bu,batching_vertex:zu,begin_vertex:Vu,beginnormal_vertex:ku,bsdfs:Hu,iridescence_fragment:Gu,bumpmap_pars_fragment:Wu,clipping_planes_fragment:Xu,clipping_planes_pars_fragment:Yu,clipping_planes_pars_vertex:qu,clipping_planes_vertex:$u,color_fragment:Zu,color_pars_fragment:Ju,color_pars_vertex:Ku,color_vertex:ju,common:Qu,cube_uv_reflection_fragment:td,defaultnormal_vertex:ed,displacementmap_pars_vertex:nd,displacementmap_vertex:id,emissivemap_fragment:sd,emissivemap_pars_fragment:rd,colorspace_fragment:od,colorspace_pars_fragment:ad,envmap_fragment:ld,envmap_common_pars_fragment:cd,envmap_pars_fragment:hd,envmap_pars_vertex:ud,envmap_physical_pars_fragment:Md,envmap_vertex:dd,fog_vertex:fd,fog_pars_vertex:pd,fog_fragment:md,fog_pars_fragment:gd,gradientmap_pars_fragment:xd,lightmap_pars_fragment:_d,lights_lambert_fragment:vd,lights_lambert_pars_fragment:yd,lights_pars_begin:bd,lights_toon_fragment:Sd,lights_toon_pars_fragment:Ed,lights_phong_fragment:wd,lights_phong_pars_fragment:Td,lights_physical_fragment:Ad,lights_physical_pars_fragment:Cd,lights_fragment_begin:Rd,lights_fragment_maps:Id,lights_fragment_end:Pd,lightprobes_pars_fragment:Ld,logdepthbuf_fragment:Dd,logdepthbuf_pars_fragment:Nd,logdepthbuf_pars_vertex:Ud,logdepthbuf_vertex:Fd,map_fragment:Od,map_pars_fragment:Bd,map_particle_fragment:zd,map_particle_pars_fragment:Vd,metalnessmap_fragment:kd,metalnessmap_pars_fragment:Hd,morphinstance_vertex:Gd,morphcolor_vertex:Wd,morphnormal_vertex:Xd,morphtarget_pars_vertex:Yd,morphtarget_vertex:qd,normal_fragment_begin:$d,normal_fragment_maps:Zd,normal_pars_fragment:Jd,normal_pars_vertex:Kd,normal_vertex:jd,normalmap_pars_fragment:Qd,clearcoat_normal_fragment_begin:tf,clearcoat_normal_fragment_maps:ef,clearcoat_pars_fragment:nf,iridescence_pars_fragment:sf,opaque_fragment:rf,packing:of,premultiplied_alpha_fragment:af,project_vertex:lf,dithering_fragment:cf,dithering_pars_fragment:hf,roughnessmap_fragment:uf,roughnessmap_pars_fragment:df,shadowmap_pars_fragment:ff,shadowmap_pars_vertex:pf,shadowmap_vertex:mf,shadowmask_pars_fragment:gf,skinbase_vertex:xf,skinning_pars_vertex:_f,skinning_vertex:vf,skinnormal_vertex:yf,specularmap_fragment:bf,specularmap_pars_fragment:Mf,tonemapping_fragment:Sf,tonemapping_pars_fragment:Ef,transmission_fragment:wf,transmission_pars_fragment:Tf,uv_pars_fragment:Af,uv_pars_vertex:Cf,uv_vertex:Rf,worldpos_vertex:If,background_vert:Pf,background_frag:Lf,backgroundCube_vert:Df,backgroundCube_frag:Nf,cube_vert:Uf,cube_frag:Ff,depth_vert:Of,depth_frag:Bf,distance_vert:zf,distance_frag:Vf,equirect_vert:kf,equirect_frag:Hf,linedashed_vert:Gf,linedashed_frag:Wf,meshbasic_vert:Xf,meshbasic_frag:Yf,meshlambert_vert:qf,meshlambert_frag:$f,meshmatcap_vert:Zf,meshmatcap_frag:Jf,meshnormal_vert:Kf,meshnormal_frag:jf,meshphong_vert:Qf,meshphong_frag:tp,meshphysical_vert:ep,meshphysical_frag:np,meshtoon_vert:ip,meshtoon_frag:sp,points_vert:rp,points_frag:op,shadow_vert:ap,shadow_frag:lp,sprite_vert:cp,sprite_frag:hp},ft={common:{diffuse:{value:new zt(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Bt},alphaMap:{value:null},alphaMapTransform:{value:new Bt},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Bt}},envmap:{envMap:{value:null},envMapRotation:{value:new Bt},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Bt}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Bt}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Bt},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Bt},normalScale:{value:new Jt(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Bt},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Bt}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Bt}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Bt}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new zt(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new N},probesMax:{value:new N},probesResolution:{value:new N}},points:{diffuse:{value:new zt(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Bt},alphaTest:{value:0},uvTransform:{value:new Bt}},sprite:{diffuse:{value:new zt(16777215)},opacity:{value:1},center:{value:new Jt(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Bt},alphaMap:{value:null},alphaMapTransform:{value:new Bt},alphaTest:{value:0}}},vn={basic:{uniforms:De([ft.common,ft.specularmap,ft.envmap,ft.aomap,ft.lightmap,ft.fog]),vertexShader:qt.meshbasic_vert,fragmentShader:qt.meshbasic_frag},lambert:{uniforms:De([ft.common,ft.specularmap,ft.envmap,ft.aomap,ft.lightmap,ft.emissivemap,ft.bumpmap,ft.normalmap,ft.displacementmap,ft.fog,ft.lights,{emissive:{value:new zt(0)},envMapIntensity:{value:1}}]),vertexShader:qt.meshlambert_vert,fragmentShader:qt.meshlambert_frag},phong:{uniforms:De([ft.common,ft.specularmap,ft.envmap,ft.aomap,ft.lightmap,ft.emissivemap,ft.bumpmap,ft.normalmap,ft.displacementmap,ft.fog,ft.lights,{emissive:{value:new zt(0)},specular:{value:new zt(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:qt.meshphong_vert,fragmentShader:qt.meshphong_frag},standard:{uniforms:De([ft.common,ft.envmap,ft.aomap,ft.lightmap,ft.emissivemap,ft.bumpmap,ft.normalmap,ft.displacementmap,ft.roughnessmap,ft.metalnessmap,ft.fog,ft.lights,{emissive:{value:new zt(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:qt.meshphysical_vert,fragmentShader:qt.meshphysical_frag},toon:{uniforms:De([ft.common,ft.aomap,ft.lightmap,ft.emissivemap,ft.bumpmap,ft.normalmap,ft.displacementmap,ft.gradientmap,ft.fog,ft.lights,{emissive:{value:new zt(0)}}]),vertexShader:qt.meshtoon_vert,fragmentShader:qt.meshtoon_frag},matcap:{uniforms:De([ft.common,ft.bumpmap,ft.normalmap,ft.displacementmap,ft.fog,{matcap:{value:null}}]),vertexShader:qt.meshmatcap_vert,fragmentShader:qt.meshmatcap_frag},points:{uniforms:De([ft.points,ft.fog]),vertexShader:qt.points_vert,fragmentShader:qt.points_frag},dashed:{uniforms:De([ft.common,ft.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:qt.linedashed_vert,fragmentShader:qt.linedashed_frag},depth:{uniforms:De([ft.common,ft.displacementmap]),vertexShader:qt.depth_vert,fragmentShader:qt.depth_frag},normal:{uniforms:De([ft.common,ft.bumpmap,ft.normalmap,ft.displacementmap,{opacity:{value:1}}]),vertexShader:qt.meshnormal_vert,fragmentShader:qt.meshnormal_frag},sprite:{uniforms:De([ft.sprite,ft.fog]),vertexShader:qt.sprite_vert,fragmentShader:qt.sprite_frag},background:{uniforms:{uvTransform:{value:new Bt},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:qt.background_vert,fragmentShader:qt.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Bt}},vertexShader:qt.backgroundCube_vert,fragmentShader:qt.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:qt.cube_vert,fragmentShader:qt.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:qt.equirect_vert,fragmentShader:qt.equirect_frag},distance:{uniforms:De([ft.common,ft.displacementmap,{referencePosition:{value:new N},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:qt.distance_vert,fragmentShader:qt.distance_frag},shadow:{uniforms:De([ft.lights,ft.fog,{color:{value:new zt(0)},opacity:{value:1}}]),vertexShader:qt.shadow_vert,fragmentShader:qt.shadow_frag}};vn.physical={uniforms:De([vn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Bt},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Bt},clearcoatNormalScale:{value:new Jt(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Bt},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Bt},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Bt},sheen:{value:0},sheenColor:{value:new zt(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Bt},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Bt},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Bt},transmissionSamplerSize:{value:new Jt},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Bt},attenuationDistance:{value:0},attenuationColor:{value:new zt(0)},specularColor:{value:new zt(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Bt},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Bt},anisotropyVector:{value:new Jt},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Bt}}]),vertexShader:qt.meshphysical_vert,fragmentShader:qt.meshphysical_frag};var Io={r:0,b:0,g:0},up=new ue,ih=new Bt;ih.set(-1,0,0,0,1,0,0,0,1);function dp(i,t,e,n,s,r){let o=new zt(0),a=s===!0?0:1,l,c,h=null,d=0,u=null;function f(A){let w=A.isScene===!0?A.background:null;if(w&&w.isTexture){let M=A.backgroundBlurriness>0;w=t.get(w,M)}return w}function m(A){let w=!1,M=f(A);M===null?g(o,a):M&&M.isColor&&(g(M,1),w=!0);let y=i.xr.getEnvironmentBlendMode();y==="additive"?e.buffers.color.setClear(0,0,0,1,r):y==="alpha-blend"&&e.buffers.color.setClear(0,0,0,0,r),(i.autoClear||w)&&(e.buffers.depth.setTest(!0),e.buffers.depth.setMask(!0),e.buffers.color.setMask(!0),i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil))}function v(A,w){let M=f(w);M&&(M.isCubeTexture||M.mapping===ws)?(c===void 0&&(c=new ge(new Hi(1,1,1),new Ue({name:"BackgroundCubeMaterial",uniforms:di(vn.backgroundCube.uniforms),vertexShader:vn.backgroundCube.vertexShader,fragmentShader:vn.backgroundCube.fragmentShader,side:Ae,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(y,S,C){this.matrixWorld.copyPosition(C.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(c)),c.material.uniforms.envMap.value=M,c.material.uniforms.backgroundBlurriness.value=w.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=w.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(up.makeRotationFromEuler(w.backgroundRotation)).transpose(),M.isCubeTexture&&M.isRenderTargetTexture===!1&&c.material.uniforms.backgroundRotation.value.premultiply(ih),c.material.toneMapped=Kt.getTransfer(M.colorSpace)!==ne,(h!==M||d!==M.version||u!==i.toneMapping)&&(c.material.needsUpdate=!0,h=M,d=M.version,u=i.toneMapping),c.layers.enableAll(),A.unshift(c,c.geometry,c.material,0,0,null)):M&&M.isTexture&&(l===void 0&&(l=new ge(new _s(2,2),new Ue({name:"BackgroundMaterial",uniforms:di(vn.background.uniforms),vertexShader:vn.background.vertexShader,fragmentShader:vn.background.fragmentShader,side:An,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(l)),l.material.uniforms.t2D.value=M,l.material.uniforms.backgroundIntensity.value=w.backgroundIntensity,l.material.toneMapped=Kt.getTransfer(M.colorSpace)!==ne,M.matrixAutoUpdate===!0&&M.updateMatrix(),l.material.uniforms.uvTransform.value.copy(M.matrix),(h!==M||d!==M.version||u!==i.toneMapping)&&(l.material.needsUpdate=!0,h=M,d=M.version,u=i.toneMapping),l.layers.enableAll(),A.unshift(l,l.geometry,l.material,0,0,null))}function g(A,w){A.getRGB(Io,qa(i)),e.buffers.color.setClear(Io.r,Io.g,Io.b,w,r)}function p(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return o},setClearColor:function(A,w=1){o.set(A),a=w,g(o,a)},getClearAlpha:function(){return a},setClearAlpha:function(A){a=A,g(o,a)},render:m,addToRenderList:v,dispose:p}}function fp(i,t){let e=i.getParameter(i.MAX_VERTEX_ATTRIBS),n={},s=u(null),r=s,o=!1;function a(I,L,Y,q,O){let z=!1,k=d(I,q,Y,L);r!==k&&(r=k,c(r.object)),z=f(I,q,Y,O),z&&m(I,q,Y,O),O!==null&&t.update(O,i.ELEMENT_ARRAY_BUFFER),(z||o)&&(o=!1,M(I,L,Y,q),O!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,t.get(O).buffer))}function l(){return i.createVertexArray()}function c(I){return i.bindVertexArray(I)}function h(I){return i.deleteVertexArray(I)}function d(I,L,Y,q){let O=q.wireframe===!0,z=n[L.id];z===void 0&&(z={},n[L.id]=z);let k=I.isInstancedMesh===!0?I.id:0,$=z[k];$===void 0&&($={},z[k]=$);let et=$[Y.id];et===void 0&&(et={},$[Y.id]=et);let rt=et[O];return rt===void 0&&(rt=u(l()),et[O]=rt),rt}function u(I){let L=[],Y=[],q=[];for(let O=0;O<e;O++)L[O]=0,Y[O]=0,q[O]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:L,enabledAttributes:Y,attributeDivisors:q,object:I,attributes:{},index:null}}function f(I,L,Y,q){let O=r.attributes,z=L.attributes,k=0,$=Y.getAttributes();for(let et in $)if($[et].location>=0){let ot=O[et],_t=z[et];if(_t===void 0&&(et==="instanceMatrix"&&I.instanceMatrix&&(_t=I.instanceMatrix),et==="instanceColor"&&I.instanceColor&&(_t=I.instanceColor)),ot===void 0||ot.attribute!==_t||_t&&ot.data!==_t.data)return!0;k++}return r.attributesNum!==k||r.index!==q}function m(I,L,Y,q){let O={},z=L.attributes,k=0,$=Y.getAttributes();for(let et in $)if($[et].location>=0){let ot=z[et];ot===void 0&&(et==="instanceMatrix"&&I.instanceMatrix&&(ot=I.instanceMatrix),et==="instanceColor"&&I.instanceColor&&(ot=I.instanceColor));let _t={};_t.attribute=ot,ot&&ot.data&&(_t.data=ot.data),O[et]=_t,k++}r.attributes=O,r.attributesNum=k,r.index=q}function v(){let I=r.newAttributes;for(let L=0,Y=I.length;L<Y;L++)I[L]=0}function g(I){p(I,0)}function p(I,L){let Y=r.newAttributes,q=r.enabledAttributes,O=r.attributeDivisors;Y[I]=1,q[I]===0&&(i.enableVertexAttribArray(I),q[I]=1),O[I]!==L&&(i.vertexAttribDivisor(I,L),O[I]=L)}function A(){let I=r.newAttributes,L=r.enabledAttributes;for(let Y=0,q=L.length;Y<q;Y++)L[Y]!==I[Y]&&(i.disableVertexAttribArray(Y),L[Y]=0)}function w(I,L,Y,q,O,z,k){k===!0?i.vertexAttribIPointer(I,L,Y,O,z):i.vertexAttribPointer(I,L,Y,q,O,z)}function M(I,L,Y,q){v();let O=q.attributes,z=Y.getAttributes(),k=L.defaultAttributeValues;for(let $ in z){let et=z[$];if(et.location>=0){let rt=O[$];if(rt===void 0&&($==="instanceMatrix"&&I.instanceMatrix&&(rt=I.instanceMatrix),$==="instanceColor"&&I.instanceColor&&(rt=I.instanceColor)),rt!==void 0){let ot=rt.normalized,_t=rt.itemSize,Vt=t.get(rt);if(Vt===void 0)continue;let te=Vt.buffer,$t=Vt.type,j=Vt.bytesPerElement,at=$t===i.INT||$t===i.UNSIGNED_INT||rt.gpuType===Wr;if(rt.isInterleavedBufferAttribute){let it=rt.data,Ot=it.stride,kt=rt.offset;if(it.isInstancedInterleavedBuffer){for(let Lt=0;Lt<et.locationSize;Lt++)p(et.location+Lt,it.meshPerAttribute);I.isInstancedMesh!==!0&&q._maxInstanceCount===void 0&&(q._maxInstanceCount=it.meshPerAttribute*it.count)}else for(let Lt=0;Lt<et.locationSize;Lt++)g(et.location+Lt);i.bindBuffer(i.ARRAY_BUFFER,te);for(let Lt=0;Lt<et.locationSize;Lt++)w(et.location+Lt,_t/et.locationSize,$t,ot,Ot*j,(kt+_t/et.locationSize*Lt)*j,at)}else{if(rt.isInstancedBufferAttribute){for(let it=0;it<et.locationSize;it++)p(et.location+it,rt.meshPerAttribute);I.isInstancedMesh!==!0&&q._maxInstanceCount===void 0&&(q._maxInstanceCount=rt.meshPerAttribute*rt.count)}else for(let it=0;it<et.locationSize;it++)g(et.location+it);i.bindBuffer(i.ARRAY_BUFFER,te);for(let it=0;it<et.locationSize;it++)w(et.location+it,_t/et.locationSize,$t,ot,_t*j,_t/et.locationSize*it*j,at)}}else if(k!==void 0){let ot=k[$];if(ot!==void 0)switch(ot.length){case 2:i.vertexAttrib2fv(et.location,ot);break;case 3:i.vertexAttrib3fv(et.location,ot);break;case 4:i.vertexAttrib4fv(et.location,ot);break;default:i.vertexAttrib1fv(et.location,ot)}}}}A()}function y(){E();for(let I in n){let L=n[I];for(let Y in L){let q=L[Y];for(let O in q){let z=q[O];for(let k in z)h(z[k].object),delete z[k];delete q[O]}}delete n[I]}}function S(I){if(n[I.id]===void 0)return;let L=n[I.id];for(let Y in L){let q=L[Y];for(let O in q){let z=q[O];for(let k in z)h(z[k].object),delete z[k];delete q[O]}}delete n[I.id]}function C(I){for(let L in n){let Y=n[L];for(let q in Y){let O=Y[q];if(O[I.id]===void 0)continue;let z=O[I.id];for(let k in z)h(z[k].object),delete z[k];delete O[I.id]}}}function _(I){for(let L in n){let Y=n[L],q=I.isInstancedMesh===!0?I.id:0,O=Y[q];if(O!==void 0){for(let z in O){let k=O[z];for(let $ in k)h(k[$].object),delete k[$];delete O[z]}delete Y[q],Object.keys(Y).length===0&&delete n[L]}}}function E(){R(),o=!0,r!==s&&(r=s,c(r.object))}function R(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:a,reset:E,resetDefaultState:R,dispose:y,releaseStatesOfGeometry:S,releaseStatesOfObject:_,releaseStatesOfProgram:C,initAttributes:v,enableAttribute:g,disableUnusedAttributes:A}}function pp(i,t,e){let n;function s(l){n=l}function r(l,c){i.drawArrays(n,l,c),e.update(c,n,1)}function o(l,c,h){h!==0&&(i.drawArraysInstanced(n,l,c,h),e.update(c,n,h))}function a(l,c,h){if(h===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,c,0,h);let u=0;for(let f=0;f<h;f++)u+=c[f];e.update(u,n,1)}this.setMode=s,this.render=r,this.renderInstances=o,this.renderMultiDraw=a}function mp(i,t,e,n){let s;function r(){if(s!==void 0)return s;if(t.has("EXT_texture_filter_anisotropic")===!0){let C=t.get("EXT_texture_filter_anisotropic");s=i.getParameter(C.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function o(C){return!(C!==Ke&&n.convert(C)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT))}function a(C){let _=C===xn&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(C!==Ve&&n.convert(C)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE)&&C!==on&&!_)}function l(C){if(C==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";C="mediump"}return C==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=e.precision!==void 0?e.precision:"highp",h=l(c);h!==c&&(Nt("WebGLRenderer:",c,"not supported, using",h,"instead."),c=h);let d=e.logarithmicDepthBuffer===!0,u=e.reversedDepthBuffer===!0&&t.has("EXT_clip_control");e.reversedDepthBuffer===!0&&u===!1&&Nt("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");let f=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),m=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),v=i.getParameter(i.MAX_TEXTURE_SIZE),g=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),p=i.getParameter(i.MAX_VERTEX_ATTRIBS),A=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),w=i.getParameter(i.MAX_VARYING_VECTORS),M=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),y=i.getParameter(i.MAX_SAMPLES),S=i.getParameter(i.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:l,textureFormatReadable:o,textureTypeReadable:a,precision:c,logarithmicDepthBuffer:d,reversedDepthBuffer:u,maxTextures:f,maxVertexTextures:m,maxTextureSize:v,maxCubemapSize:g,maxAttributes:p,maxVertexUniforms:A,maxVaryings:w,maxFragmentUniforms:M,maxSamples:y,samples:S}}function gp(i){let t=this,e=null,n=0,s=!1,r=!1,o=new Ze,a=new Bt,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(d,u){let f=d.length!==0||u||n!==0||s;return s=u,n=d.length,f},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(d,u){e=h(d,u,0)},this.setState=function(d,u,f){let m=d.clippingPlanes,v=d.clipIntersection,g=d.clipShadows,p=i.get(d);if(!s||m===null||m.length===0||r&&!g)r?h(null):c();else{let A=r?0:n,w=A*4,M=p.clippingState||null;l.value=M,M=h(m,u,w,f);for(let y=0;y!==w;++y)M[y]=e[y];p.clippingState=M,this.numIntersection=v?this.numPlanes:0,this.numPlanes+=A}};function c(){l.value!==e&&(l.value=e,l.needsUpdate=n>0),t.numPlanes=n,t.numIntersection=0}function h(d,u,f,m){let v=d!==null?d.length:0,g=null;if(v!==0){if(g=l.value,m!==!0||g===null){let p=f+v*4,A=u.matrixWorldInverse;a.getNormalMatrix(A),(g===null||g.length<p)&&(g=new Float32Array(p));for(let w=0,M=f;w!==v;++w,M+=4)o.copy(d[w]).applyMatrix4(A,a),o.normal.toArray(g,M),g[M+3]=o.constant}l.value=g,l.needsUpdate=!0}return t.numPlanes=v,t.numIntersection=0,g}}var ti=4,Nc=[.125,.215,.35,.446,.526,.582],fi=20,xp=256,Ds=new Xi,Uc=new zt,Ka=null,ja=0,Qa=0,tl=!1,_p=new N,Lo=class{constructor(t){this._renderer=t,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(t,e=0,n=.1,s=100,r={}){let{size:o=256,position:a=_p}=r;Ka=this._renderer.getRenderTarget(),ja=this._renderer.getActiveCubeFace(),Qa=this._renderer.getActiveMipmapLevel(),tl=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(o);let l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(t,n,s,l,a),e>0&&this._blur(l,0,0,e),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(t,e=null){return this._fromTexture(t,e)}fromCubemap(t,e=null){return this._fromTexture(t,e)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Bc(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Oc(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(t){this._lodMax=Math.floor(Math.log2(t)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let t=0;t<this._lodMeshes.length;t++)this._lodMeshes[t].geometry.dispose()}_cleanup(t){this._renderer.setRenderTarget(Ka,ja,Qa),this._renderer.xr.enabled=tl,t.scissorTest=!1,Ki(t,0,0,t.width,t.height)}_fromTexture(t,e){t.mapping===Zn||t.mapping===ui?this._setSize(t.image.length===0?16:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4),Ka=this._renderer.getRenderTarget(),ja=this._renderer.getActiveCubeFace(),Qa=this._renderer.getActiveMipmapLevel(),tl=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=e||this._allocateTargets();return this._textureToCubeUV(t,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let t=3*Math.max(this._cubeSize,112),e=4*this._cubeSize,n={magFilter:Te,minFilter:Te,generateMipmaps:!1,type:xn,format:Ke,colorSpace:as,depthBuffer:!1},s=Fc(t,e,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==t||this._pingPongRenderTarget.height!==e){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Fc(t,e,n);let{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=vp(r)),this._blurMaterial=bp(r,t,e),this._ggxMaterial=yp(r,t,e)}return s}_compileMaterial(t){let e=new ge(new ze,t);this._renderer.compile(e,Ds)}_sceneToCubeUV(t,e,n,s,r){let l=new Pe(90,1,e,n),c=[1,-1,1,1,1,1],h=[1,1,1,-1,-1,-1],d=this._renderer,u=d.autoClear,f=d.toneMapping;d.getClearColor(Uc),d.toneMapping=sn,d.autoClear=!1,d.state.buffers.depth.getReversed()&&(d.setRenderTarget(s),d.clearDepth(),d.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new ge(new Hi,new nn({name:"PMREM.Background",side:Ae,depthWrite:!1,depthTest:!1})));let v=this._backgroundBox,g=v.material,p=!1,A=t.background;A?A.isColor&&(g.color.copy(A),t.background=null,p=!0):(g.color.copy(Uc),p=!0);for(let w=0;w<6;w++){let M=w%3;M===0?(l.up.set(0,c[w],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x+h[w],r.y,r.z)):M===1?(l.up.set(0,0,c[w]),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y+h[w],r.z)):(l.up.set(0,c[w],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y,r.z+h[w]));let y=this._cubeSize;Ki(s,M*y,w>2?y:0,y,y),d.setRenderTarget(s),p&&d.render(v,l),d.render(t,l)}d.toneMapping=f,d.autoClear=u,t.background=A}_textureToCubeUV(t,e){let n=this._renderer,s=t.mapping===Zn||t.mapping===ui;s?(this._cubemapMaterial===null&&(this._cubemapMaterial=Bc()),this._cubemapMaterial.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Oc());let r=s?this._cubemapMaterial:this._equirectMaterial,o=this._lodMeshes[0];o.material=r;let a=r.uniforms;a.envMap.value=t;let l=this._cubeSize;Ki(e,0,0,3*l,2*l),n.setRenderTarget(e),n.render(o,Ds)}_applyPMREM(t){let e=this._renderer,n=e.autoClear;e.autoClear=!1;let s=this._lodMeshes.length;for(let r=1;r<s;r++)this._applyGGXFilter(t,r-1,r);e.autoClear=n}_applyGGXFilter(t,e,n){let s=this._renderer,r=this._pingPongRenderTarget,o=this._ggxMaterial,a=this._lodMeshes[n];a.material=o;let l=o.uniforms,c=n/(this._lodMeshes.length-1),h=e/(this._lodMeshes.length-1),d=Math.sqrt(c*c-h*h),u=0+c*1.25,f=d*u,{_lodMax:m}=this,v=this._sizeLods[n],g=3*v*(n>m-ti?n-m+ti:0),p=4*(this._cubeSize-v);l.envMap.value=t.texture,l.roughness.value=f,l.mipInt.value=m-e,Ki(r,g,p,3*v,2*v),s.setRenderTarget(r),s.render(a,Ds),l.envMap.value=r.texture,l.roughness.value=0,l.mipInt.value=m-n,Ki(t,g,p,3*v,2*v),s.setRenderTarget(t),s.render(a,Ds)}_blur(t,e,n,s,r){let o=this._pingPongRenderTarget;this._halfBlur(t,o,e,n,s,"latitudinal",r),this._halfBlur(o,t,n,n,s,"longitudinal",r)}_halfBlur(t,e,n,s,r,o,a){let l=this._renderer,c=this._blurMaterial;o!=="latitudinal"&&o!=="longitudinal"&&Ft("blur direction must be either latitudinal or longitudinal!");let h=3,d=this._lodMeshes[s];d.material=c;let u=c.uniforms,f=this._sizeLods[n]-1,m=isFinite(r)?Math.PI/(2*f):2*Math.PI/(2*fi-1),v=r/m,g=isFinite(r)?1+Math.floor(h*v):fi;g>fi&&Nt(`sigmaRadians, ${r}, is too large and will clip, as it requested ${g} samples when the maximum is set to ${fi}`);let p=[],A=0;for(let C=0;C<fi;++C){let _=C/v,E=Math.exp(-_*_/2);p.push(E),C===0?A+=E:C<g&&(A+=2*E)}for(let C=0;C<p.length;C++)p[C]=p[C]/A;u.envMap.value=t.texture,u.samples.value=g,u.weights.value=p,u.latitudinal.value=o==="latitudinal",a&&(u.poleAxis.value=a);let{_lodMax:w}=this;u.dTheta.value=m,u.mipInt.value=w-n;let M=this._sizeLods[s],y=3*M*(s>w-ti?s-w+ti:0),S=4*(this._cubeSize-M);Ki(e,y,S,3*M,2*M),l.setRenderTarget(e),l.render(d,Ds)}};function vp(i){let t=[],e=[],n=[],s=i,r=i-ti+1+Nc.length;for(let o=0;o<r;o++){let a=Math.pow(2,s);t.push(a);let l=1/a;o>i-ti?l=Nc[o-i+ti-1]:o===0&&(l=0),e.push(l);let c=1/(a-2),h=-c,d=1+c,u=[h,h,d,h,d,d,h,h,d,d,h,d],f=6,m=6,v=3,g=2,p=1,A=new Float32Array(v*m*f),w=new Float32Array(g*m*f),M=new Float32Array(p*m*f);for(let S=0;S<f;S++){let C=S%3*2/3-1,_=S>2?0:-1,E=[C,_,0,C+2/3,_,0,C+2/3,_+1,0,C,_,0,C+2/3,_+1,0,C,_+1,0];A.set(E,v*m*S),w.set(u,g*m*S);let R=[S,S,S,S,S,S];M.set(R,p*m*S)}let y=new ze;y.setAttribute("position",new ye(A,v)),y.setAttribute("uv",new ye(w,g)),y.setAttribute("faceIndex",new ye(M,p)),n.push(new ge(y,null)),s>ti&&s--}return{lodMeshes:n,sizeLods:t,sigmas:e}}function Fc(i,t,e){let n=new Xe(i,t,e);return n.texture.mapping=ws,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function Ki(i,t,e,n,s){i.viewport.set(t,e,n,s),i.scissor.set(t,e,n,s)}function yp(i,t,e){return new Ue({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:xp,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Uo(),fragmentShader:`

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
		`,blending:gn,depthTest:!1,depthWrite:!1})}function bp(i,t,e){let n=new Float32Array(fi),s=new N(0,1,0);return new Ue({name:"SphericalGaussianBlur",defines:{n:fi,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:s}},vertexShader:Uo(),fragmentShader:`

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
		`,blending:gn,depthTest:!1,depthWrite:!1})}function Oc(){return new Ue({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Uo(),fragmentShader:`

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
		`,blending:gn,depthTest:!1,depthWrite:!1})}function Bc(){return new Ue({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Uo(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:gn,depthTest:!1,depthWrite:!1})}function Uo(){return`

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
	`}var Do=class extends Xe{constructor(t=1,e={}){super(t,t,e),this.isWebGLCubeRenderTarget=!0;let n={width:t,height:t,depth:1},s=[n,n,n,n,n,n];this.texture=new gs(s),this._setTextureOptions(e),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(t,e){this.texture.type=e.type,this.texture.colorSpace=e.colorSpace,this.texture.generateMipmaps=e.generateMipmaps,this.texture.minFilter=e.minFilter,this.texture.magFilter=e.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

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
			`},s=new Hi(5,5,5),r=new Ue({name:"CubemapFromEquirect",uniforms:di(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Ae,blending:gn});r.uniforms.tEquirect.value=e;let o=new ge(s,r),a=e.minFilter;return e.minFilter===Jn&&(e.minFilter=Te),new zr(1,10,this).update(t,o),e.minFilter=a,o.geometry.dispose(),o.material.dispose(),this}clear(t,e=!0,n=!0,s=!0){let r=t.getRenderTarget();for(let o=0;o<6;o++)t.setRenderTarget(this,o),t.clear(e,n,s);t.setRenderTarget(r)}};function Mp(i){let t=new WeakMap,e=new WeakMap,n=null;function s(u,f=!1){return u==null?null:f?o(u):r(u)}function r(u){if(u&&u.isTexture){let f=u.mapping;if(f===kr||f===Hr)if(t.has(u)){let m=t.get(u).texture;return a(m,u.mapping)}else{let m=u.image;if(m&&m.height>0){let v=new Do(m.height);return v.fromEquirectangularTexture(i,u),t.set(u,v),u.addEventListener("dispose",c),a(v.texture,u.mapping)}else return null}}return u}function o(u){if(u&&u.isTexture){let f=u.mapping,m=f===kr||f===Hr,v=f===Zn||f===ui;if(m||v){let g=e.get(u),p=g!==void 0?g.texture.pmremVersion:0;if(u.isRenderTargetTexture&&u.pmremVersion!==p)return n===null&&(n=new Lo(i)),g=m?n.fromEquirectangular(u,g):n.fromCubemap(u,g),g.texture.pmremVersion=u.pmremVersion,e.set(u,g),g.texture;if(g!==void 0)return g.texture;{let A=u.image;return m&&A&&A.height>0||v&&A&&l(A)?(n===null&&(n=new Lo(i)),g=m?n.fromEquirectangular(u):n.fromCubemap(u),g.texture.pmremVersion=u.pmremVersion,e.set(u,g),u.addEventListener("dispose",h),g.texture):null}}}return u}function a(u,f){return f===kr?u.mapping=Zn:f===Hr&&(u.mapping=ui),u}function l(u){let f=0,m=6;for(let v=0;v<m;v++)u[v]!==void 0&&f++;return f===m}function c(u){let f=u.target;f.removeEventListener("dispose",c);let m=t.get(f);m!==void 0&&(t.delete(f),m.dispose())}function h(u){let f=u.target;f.removeEventListener("dispose",h);let m=e.get(f);m!==void 0&&(e.delete(f),m.dispose())}function d(){t=new WeakMap,e=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:s,dispose:d}}function Sp(i){let t={};function e(n){if(t[n]!==void 0)return t[n];let s=i.getExtension(n);return t[n]=s,s}return{has:function(n){return e(n)!==null},init:function(){e("EXT_color_buffer_float"),e("WEBGL_clip_cull_distance"),e("OES_texture_float_linear"),e("EXT_color_buffer_half_float"),e("WEBGL_multisampled_render_to_texture"),e("WEBGL_render_shared_exponent")},get:function(n){let s=e(n);return s===null&&ai("WebGLRenderer: "+n+" extension not supported."),s}}}function Ep(i,t,e,n){let s={},r=new WeakMap;function o(d){let u=d.target;u.index!==null&&t.remove(u.index);for(let m in u.attributes)t.remove(u.attributes[m]);u.removeEventListener("dispose",o),delete s[u.id];let f=r.get(u);f&&(t.remove(f),r.delete(u)),n.releaseStatesOfGeometry(u),u.isInstancedBufferGeometry===!0&&delete u._maxInstanceCount,e.memory.geometries--}function a(d,u){return s[u.id]===!0||(u.addEventListener("dispose",o),s[u.id]=!0,e.memory.geometries++),u}function l(d){let u=d.attributes;for(let f in u)t.update(u[f],i.ARRAY_BUFFER)}function c(d){let u=[],f=d.index,m=d.attributes.position,v=0;if(m===void 0)return;if(f!==null){let A=f.array;v=f.version;for(let w=0,M=A.length;w<M;w+=3){let y=A[w+0],S=A[w+1],C=A[w+2];u.push(y,S,S,C,C,y)}}else{let A=m.array;v=m.version;for(let w=0,M=A.length/3-1;w<M;w+=3){let y=w+0,S=w+1,C=w+2;u.push(y,S,S,C,C,y)}}let g=new(m.count>=65535?ps:fs)(u,1);g.version=v;let p=r.get(d);p&&t.remove(p),r.set(d,g)}function h(d){let u=r.get(d);if(u){let f=d.index;f!==null&&u.version<f.version&&c(d)}else c(d);return r.get(d)}return{get:a,update:l,getWireframeAttribute:h}}function wp(i,t,e){let n;function s(d){n=d}let r,o;function a(d){r=d.type,o=d.bytesPerElement}function l(d,u){i.drawElements(n,u,r,d*o),e.update(u,n,1)}function c(d,u,f){f!==0&&(i.drawElementsInstanced(n,u,r,d*o,f),e.update(u,n,f))}function h(d,u,f){if(f===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,u,0,r,d,0,f);let v=0;for(let g=0;g<f;g++)v+=u[g];e.update(v,n,1)}this.setMode=s,this.setIndex=a,this.render=l,this.renderInstances=c,this.renderMultiDraw=h}function Tp(i){let t={geometries:0,textures:0},e={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,o,a){switch(e.calls++,o){case i.TRIANGLES:e.triangles+=a*(r/3);break;case i.LINES:e.lines+=a*(r/2);break;case i.LINE_STRIP:e.lines+=a*(r-1);break;case i.LINE_LOOP:e.lines+=a*r;break;case i.POINTS:e.points+=a*r;break;default:Ft("WebGLInfo: Unknown draw mode:",o);break}}function s(){e.calls=0,e.triangles=0,e.points=0,e.lines=0}return{memory:t,render:e,programs:null,autoReset:!0,reset:s,update:n}}function Ap(i,t,e){let n=new WeakMap,s=new de;function r(o,a,l){let c=o.morphTargetInfluences,h=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,d=h!==void 0?h.length:0,u=n.get(a);if(u===void 0||u.count!==d){let E=function(){C.dispose(),n.delete(a),a.removeEventListener("dispose",E)};u!==void 0&&u.texture.dispose();let f=a.morphAttributes.position!==void 0,m=a.morphAttributes.normal!==void 0,v=a.morphAttributes.color!==void 0,g=a.morphAttributes.position||[],p=a.morphAttributes.normal||[],A=a.morphAttributes.color||[],w=0;f===!0&&(w=1),m===!0&&(w=2),v===!0&&(w=3);let M=a.attributes.position.count*w,y=1;M>t.maxTextureSize&&(y=Math.ceil(M/t.maxTextureSize),M=t.maxTextureSize);let S=new Float32Array(M*y*4*d),C=new hs(S,M,y,d);C.type=on,C.needsUpdate=!0;let _=w*4;for(let R=0;R<d;R++){let I=g[R],L=p[R],Y=A[R],q=M*y*4*R;for(let O=0;O<I.count;O++){let z=O*_;f===!0&&(s.fromBufferAttribute(I,O),S[q+z+0]=s.x,S[q+z+1]=s.y,S[q+z+2]=s.z,S[q+z+3]=0),m===!0&&(s.fromBufferAttribute(L,O),S[q+z+4]=s.x,S[q+z+5]=s.y,S[q+z+6]=s.z,S[q+z+7]=0),v===!0&&(s.fromBufferAttribute(Y,O),S[q+z+8]=s.x,S[q+z+9]=s.y,S[q+z+10]=s.z,S[q+z+11]=Y.itemSize===4?s.w:1)}}u={count:d,texture:C,size:new Jt(M,y)},n.set(a,u),a.addEventListener("dispose",E)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)l.getUniforms().setValue(i,"morphTexture",o.morphTexture,e);else{let f=0;for(let v=0;v<c.length;v++)f+=c[v];let m=a.morphTargetsRelative?1:1-f;l.getUniforms().setValue(i,"morphTargetBaseInfluence",m),l.getUniforms().setValue(i,"morphTargetInfluences",c)}l.getUniforms().setValue(i,"morphTargetsTexture",u.texture,e),l.getUniforms().setValue(i,"morphTargetsTextureSize",u.size)}return{update:r}}function Cp(i,t,e,n,s){let r=new WeakMap;function o(c){let h=s.render.frame,d=c.geometry,u=t.get(c,d);if(r.get(u)!==h&&(t.update(u),r.set(u,h)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),r.get(c)!==h&&(e.update(c.instanceMatrix,i.ARRAY_BUFFER),c.instanceColor!==null&&e.update(c.instanceColor,i.ARRAY_BUFFER),r.set(c,h))),c.isSkinnedMesh){let f=c.skeleton;r.get(f)!==h&&(f.update(),r.set(f,h))}return u}function a(){r=new WeakMap}function l(c){let h=c.target;h.removeEventListener("dispose",l),n.releaseStatesOfObject(h),e.remove(h.instanceMatrix),h.instanceColor!==null&&e.remove(h.instanceColor)}return{update:o,dispose:a}}var Rp={[Ca]:"LINEAR_TONE_MAPPING",[Ra]:"REINHARD_TONE_MAPPING",[Ia]:"CINEON_TONE_MAPPING",[Pa]:"ACES_FILMIC_TONE_MAPPING",[Da]:"AGX_TONE_MAPPING",[Na]:"NEUTRAL_TONE_MAPPING",[La]:"CUSTOM_TONE_MAPPING"};function Ip(i,t,e,n,s,r){let o=new Xe(t,e,{type:i,depthBuffer:s,stencilBuffer:r,samples:n?4:0,depthTexture:s?new Rn(t,e):void 0}),a=new Xe(t,e,{type:xn,depthBuffer:!1,stencilBuffer:!1}),l=new ze;l.setAttribute("position",new Ee([-1,3,0,-1,-1,0,3,-1,0],3)),l.setAttribute("uv",new Ee([0,2,0,0,2,0],2));let c=new Tr({uniforms:{tDiffuse:{value:null}},vertexShader:`
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
			}`,depthTest:!1,depthWrite:!1}),h=new ge(l,c),d=new Xi(-1,1,1,-1,0,1),u=null,f=null,m=!1,v,g=null,p=[],A=!1;this.setSize=function(w,M){o.setSize(w,M),a.setSize(w,M);for(let y=0;y<p.length;y++){let S=p[y];S.setSize&&S.setSize(w,M)}},this.setEffects=function(w){p=w,A=p.length>0&&p[0].isRenderPass===!0;let M=o.width,y=o.height;for(let S=0;S<p.length;S++){let C=p[S];C.setSize&&C.setSize(M,y)}},this.begin=function(w,M){if(m||w.toneMapping===sn&&p.length===0)return!1;if(g=M,M!==null){let y=M.width,S=M.height;(o.width!==y||o.height!==S)&&this.setSize(y,S)}return A===!1&&w.setRenderTarget(o),v=w.toneMapping,w.toneMapping=sn,!0},this.hasRenderPass=function(){return A},this.end=function(w,M){w.toneMapping=v,m=!0;let y=o,S=a;for(let C=0;C<p.length;C++){let _=p[C];if(_.enabled!==!1&&(_.render(w,S,y,M),_.needsSwap!==!1)){let E=y;y=S,S=E}}if(u!==w.outputColorSpace||f!==w.toneMapping){u=w.outputColorSpace,f=w.toneMapping,c.defines={},Kt.getTransfer(u)===ne&&(c.defines.SRGB_TRANSFER="");let C=Rp[f];C&&(c.defines[C]=""),c.needsUpdate=!0}c.uniforms.tDiffuse.value=y.texture,w.setRenderTarget(g),w.render(h,d),g=null,m=!1},this.isCompositing=function(){return m},this.dispose=function(){o.depthTexture&&o.depthTexture.dispose(),o.dispose(),a.dispose(),l.dispose(),c.dispose()}}var sh=new Be,il=new Rn(1,1),rh=new hs,oh=new Sr,ah=new gs,zc=[],Vc=[],kc=new Float32Array(16),Hc=new Float32Array(9),Gc=new Float32Array(4);function Qi(i,t,e){let n=i[0];if(n<=0||n>0)return i;let s=t*e,r=zc[s];if(r===void 0&&(r=new Float32Array(s),zc[s]=r),t!==0){n.toArray(r,0);for(let o=1,a=0;o!==t;++o)a+=e,i[o].toArray(r,a)}return r}function be(i,t){if(i.length!==t.length)return!1;for(let e=0,n=i.length;e<n;e++)if(i[e]!==t[e])return!1;return!0}function Me(i,t){for(let e=0,n=t.length;e<n;e++)i[e]=t[e]}function Fo(i,t){let e=Vc[t];e===void 0&&(e=new Int32Array(t),Vc[t]=e);for(let n=0;n!==t;++n)e[n]=i.allocateTextureUnit();return e}function Pp(i,t){let e=this.cache;e[0]!==t&&(i.uniform1f(this.addr,t),e[0]=t)}function Lp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2f(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(be(e,t))return;i.uniform2fv(this.addr,t),Me(e,t)}}function Dp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3f(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else if(t.r!==void 0)(e[0]!==t.r||e[1]!==t.g||e[2]!==t.b)&&(i.uniform3f(this.addr,t.r,t.g,t.b),e[0]=t.r,e[1]=t.g,e[2]=t.b);else{if(be(e,t))return;i.uniform3fv(this.addr,t),Me(e,t)}}function Np(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4f(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(be(e,t))return;i.uniform4fv(this.addr,t),Me(e,t)}}function Up(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(be(e,t))return;i.uniformMatrix2fv(this.addr,!1,t),Me(e,t)}else{if(be(e,n))return;Gc.set(n),i.uniformMatrix2fv(this.addr,!1,Gc),Me(e,n)}}function Fp(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(be(e,t))return;i.uniformMatrix3fv(this.addr,!1,t),Me(e,t)}else{if(be(e,n))return;Hc.set(n),i.uniformMatrix3fv(this.addr,!1,Hc),Me(e,n)}}function Op(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(be(e,t))return;i.uniformMatrix4fv(this.addr,!1,t),Me(e,t)}else{if(be(e,n))return;kc.set(n),i.uniformMatrix4fv(this.addr,!1,kc),Me(e,n)}}function Bp(i,t){let e=this.cache;e[0]!==t&&(i.uniform1i(this.addr,t),e[0]=t)}function zp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2i(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(be(e,t))return;i.uniform2iv(this.addr,t),Me(e,t)}}function Vp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3i(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(be(e,t))return;i.uniform3iv(this.addr,t),Me(e,t)}}function kp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4i(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(be(e,t))return;i.uniform4iv(this.addr,t),Me(e,t)}}function Hp(i,t){let e=this.cache;e[0]!==t&&(i.uniform1ui(this.addr,t),e[0]=t)}function Gp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2ui(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(be(e,t))return;i.uniform2uiv(this.addr,t),Me(e,t)}}function Wp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3ui(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(be(e,t))return;i.uniform3uiv(this.addr,t),Me(e,t)}}function Xp(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4ui(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(be(e,t))return;i.uniform4uiv(this.addr,t),Me(e,t)}}function Yp(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_2D_SHADOW?(il.compareFunction=e.isReversedDepthBuffer()?Ro:Co,r=il):r=sh,e.setTexture2D(t||r,s)}function qp(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture3D(t||oh,s)}function $p(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTextureCube(t||ah,s)}function Zp(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture2DArray(t||rh,s)}function Jp(i){switch(i){case 5126:return Pp;case 35664:return Lp;case 35665:return Dp;case 35666:return Np;case 35674:return Up;case 35675:return Fp;case 35676:return Op;case 5124:case 35670:return Bp;case 35667:case 35671:return zp;case 35668:case 35672:return Vp;case 35669:case 35673:return kp;case 5125:return Hp;case 36294:return Gp;case 36295:return Wp;case 36296:return Xp;case 35678:case 36198:case 36298:case 36306:case 35682:return Yp;case 35679:case 36299:case 36307:return qp;case 35680:case 36300:case 36308:case 36293:return $p;case 36289:case 36303:case 36311:case 36292:return Zp}}function Kp(i,t){i.uniform1fv(this.addr,t)}function jp(i,t){let e=Qi(t,this.size,2);i.uniform2fv(this.addr,e)}function Qp(i,t){let e=Qi(t,this.size,3);i.uniform3fv(this.addr,e)}function tm(i,t){let e=Qi(t,this.size,4);i.uniform4fv(this.addr,e)}function em(i,t){let e=Qi(t,this.size,4);i.uniformMatrix2fv(this.addr,!1,e)}function nm(i,t){let e=Qi(t,this.size,9);i.uniformMatrix3fv(this.addr,!1,e)}function im(i,t){let e=Qi(t,this.size,16);i.uniformMatrix4fv(this.addr,!1,e)}function sm(i,t){i.uniform1iv(this.addr,t)}function rm(i,t){i.uniform2iv(this.addr,t)}function om(i,t){i.uniform3iv(this.addr,t)}function am(i,t){i.uniform4iv(this.addr,t)}function lm(i,t){i.uniform1uiv(this.addr,t)}function cm(i,t){i.uniform2uiv(this.addr,t)}function hm(i,t){i.uniform3uiv(this.addr,t)}function um(i,t){i.uniform4uiv(this.addr,t)}function dm(i,t,e){let n=this.cache,s=t.length,r=Fo(e,s);be(n,r)||(i.uniform1iv(this.addr,r),Me(n,r));let o;this.type===i.SAMPLER_2D_SHADOW?o=il:o=sh;for(let a=0;a!==s;++a)e.setTexture2D(t[a]||o,r[a])}function fm(i,t,e){let n=this.cache,s=t.length,r=Fo(e,s);be(n,r)||(i.uniform1iv(this.addr,r),Me(n,r));for(let o=0;o!==s;++o)e.setTexture3D(t[o]||oh,r[o])}function pm(i,t,e){let n=this.cache,s=t.length,r=Fo(e,s);be(n,r)||(i.uniform1iv(this.addr,r),Me(n,r));for(let o=0;o!==s;++o)e.setTextureCube(t[o]||ah,r[o])}function mm(i,t,e){let n=this.cache,s=t.length,r=Fo(e,s);be(n,r)||(i.uniform1iv(this.addr,r),Me(n,r));for(let o=0;o!==s;++o)e.setTexture2DArray(t[o]||rh,r[o])}function gm(i){switch(i){case 5126:return Kp;case 35664:return jp;case 35665:return Qp;case 35666:return tm;case 35674:return em;case 35675:return nm;case 35676:return im;case 5124:case 35670:return sm;case 35667:case 35671:return rm;case 35668:case 35672:return om;case 35669:case 35673:return am;case 5125:return lm;case 36294:return cm;case 36295:return hm;case 36296:return um;case 35678:case 36198:case 36298:case 36306:case 35682:return dm;case 35679:case 36299:case 36307:return fm;case 35680:case 36300:case 36308:case 36293:return pm;case 36289:case 36303:case 36311:case 36292:return mm}}var sl=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.setValue=Jp(e.type)}},rl=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.size=e.size,this.setValue=gm(e.type)}},ol=class{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,e,n){let s=this.seq;for(let r=0,o=s.length;r!==o;++r){let a=s[r];a.setValue(t,e[a.id],n)}}},el=/(\w+)(\])?(\[|\.)?/g;function Wc(i,t){i.seq.push(t),i.map[t.id]=t}function xm(i,t,e){let n=i.name,s=n.length;for(el.lastIndex=0;;){let r=el.exec(n),o=el.lastIndex,a=r[1],l=r[2]==="]",c=r[3];if(l&&(a=a|0),c===void 0||c==="["&&o+2===s){Wc(e,c===void 0?new sl(a,i,t):new rl(a,i,t));break}else{let d=e.map[a];d===void 0&&(d=new ol(a),Wc(e,d)),e=d}}}var ji=class{constructor(t,e){this.seq=[],this.map={};let n=t.getProgramParameter(e,t.ACTIVE_UNIFORMS);for(let o=0;o<n;++o){let a=t.getActiveUniform(e,o),l=t.getUniformLocation(e,a.name);xm(a,l,this)}let s=[],r=[];for(let o of this.seq)o.type===t.SAMPLER_2D_SHADOW||o.type===t.SAMPLER_CUBE_SHADOW||o.type===t.SAMPLER_2D_ARRAY_SHADOW?s.push(o):r.push(o);s.length>0&&(this.seq=s.concat(r))}setValue(t,e,n,s){let r=this.map[e];r!==void 0&&r.setValue(t,n,s)}setOptional(t,e,n){let s=e[n];s!==void 0&&this.setValue(t,n,s)}static upload(t,e,n,s){for(let r=0,o=e.length;r!==o;++r){let a=e[r],l=n[a.id];l.needsUpdate!==!1&&a.setValue(t,l.value,s)}}static seqWithValue(t,e){let n=[];for(let s=0,r=t.length;s!==r;++s){let o=t[s];o.id in e&&n.push(o)}return n}};function Xc(i,t,e){let n=i.createShader(t);return i.shaderSource(n,e),i.compileShader(n),n}var _m=37297,vm=0;function ym(i,t){let e=i.split(`
`),n=[],s=Math.max(t-6,0),r=Math.min(t+6,e.length);for(let o=s;o<r;o++){let a=o+1;n.push(`${a===t?">":" "} ${a}: ${e[o]}`)}return n.join(`
`)}var Yc=new Bt;function bm(i){Kt._getMatrix(Yc,Kt.workingColorSpace,i);let t=`mat3( ${Yc.elements.map(e=>e.toFixed(4))} )`;switch(Kt.getTransfer(i)){case ls:return[t,"LinearTransferOETF"];case ne:return[t,"sRGBTransferOETF"];default:return Nt("WebGLProgram: Unsupported color space: ",i),[t,"LinearTransferOETF"]}}function qc(i,t,e){let n=i.getShaderParameter(t,i.COMPILE_STATUS),r=(i.getShaderInfoLog(t)||"").trim();if(n&&r==="")return"";let o=/ERROR: 0:(\d+)/.exec(r);if(o){let a=parseInt(o[1]);return e.toUpperCase()+`

`+r+`

`+ym(i.getShaderSource(t),a)}else return r}function Mm(i,t){let e=bm(t);return[`vec4 ${i}( vec4 value ) {`,`	return ${e[1]}( vec4( value.rgb * ${e[0]}, value.a ) );`,"}"].join(`
`)}var Sm={[Ca]:"Linear",[Ra]:"Reinhard",[Ia]:"Cineon",[Pa]:"ACESFilmic",[Da]:"AgX",[Na]:"Neutral",[La]:"Custom"};function Em(i,t){let e=Sm[t];return e===void 0?(Nt("WebGLProgram: Unsupported toneMapping:",t),"vec3 "+i+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+i+"( vec3 color ) { return "+e+"ToneMapping( color ); }"}var Po=new N;function wm(){Kt.getLuminanceCoefficients(Po);let i=Po.x.toFixed(4),t=Po.y.toFixed(4),e=Po.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${i}, ${t}, ${e} );`,"	return dot( weights, rgb );","}"].join(`
`)}function Tm(i){return[i.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",i.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Us).join(`
`)}function Am(i){let t=[];for(let e in i){let n=i[e];n!==!1&&t.push("#define "+e+" "+n)}return t.join(`
`)}function Cm(i,t){let e={},n=i.getProgramParameter(t,i.ACTIVE_ATTRIBUTES);for(let s=0;s<n;s++){let r=i.getActiveAttrib(t,s),o=r.name,a=1;r.type===i.FLOAT_MAT2&&(a=2),r.type===i.FLOAT_MAT3&&(a=3),r.type===i.FLOAT_MAT4&&(a=4),e[o]={type:r.type,location:i.getAttribLocation(t,o),locationSize:a}}return e}function Us(i){return i!==""}function $c(i,t){let e=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return i.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,e).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function Zc(i,t){return i.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var Rm=/^[ \t]*#include +<([\w\d./]+)>/gm;function al(i){return i.replace(Rm,Pm)}var Im=new Map;function Pm(i,t){let e=qt[t];if(e===void 0){let n=Im.get(t);if(n!==void 0)e=qt[n],Nt('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,n);else throw new Error("THREE.WebGLProgram: Can not resolve #include <"+t+">")}return al(e)}var Lm=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Jc(i){return i.replace(Lm,Dm)}function Dm(i,t,e,n){let s="";for(let r=parseInt(t);r<parseInt(e);r++)s+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function Kc(i){let t=`precision ${i.precision} float;
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
#define LOW_PRECISION`),t}var Nm={[Es]:"SHADOWMAP_TYPE_PCF",[qi]:"SHADOWMAP_TYPE_VSM"};function Um(i){return Nm[i.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}var Fm={[Zn]:"ENVMAP_TYPE_CUBE",[ui]:"ENVMAP_TYPE_CUBE",[ws]:"ENVMAP_TYPE_CUBE_UV"};function Om(i){return i.envMap===!1?"ENVMAP_TYPE_CUBE":Fm[i.envMapMode]||"ENVMAP_TYPE_CUBE"}var Bm={[ui]:"ENVMAP_MODE_REFRACTION"};function zm(i){return i.envMap===!1?"ENVMAP_MODE_REFLECTION":Bm[i.envMapMode]||"ENVMAP_MODE_REFLECTION"}var Vm={[Aa]:"ENVMAP_BLENDING_MULTIPLY",[gc]:"ENVMAP_BLENDING_MIX",[xc]:"ENVMAP_BLENDING_ADD"};function km(i){return i.envMap===!1?"ENVMAP_BLENDING_NONE":Vm[i.combine]||"ENVMAP_BLENDING_NONE"}function Hm(i){let t=i.envMapCubeUVHeight;if(t===null)return null;let e=Math.log2(t)-2,n=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,e),112)),texelHeight:n,maxMip:e}}function Gm(i,t,e,n){let s=i.getContext(),r=e.defines,o=e.vertexShader,a=e.fragmentShader,l=Um(e),c=Om(e),h=zm(e),d=km(e),u=Hm(e),f=Tm(e),m=Am(r),v=s.createProgram(),g,p,A=e.glslVersion?"#version "+e.glslVersion+`
`:"";e.isRawShaderMaterial?(g=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,m].filter(Us).join(`
`),g.length>0&&(g+=`
`),p=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,m].filter(Us).join(`
`),p.length>0&&(p+=`
`)):(g=[Kc(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,m,e.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",e.batching?"#define USE_BATCHING":"",e.batchingColor?"#define USE_BATCHING_COLOR":"",e.instancing?"#define USE_INSTANCING":"",e.instancingColor?"#define USE_INSTANCING_COLOR":"",e.instancingMorph?"#define USE_INSTANCING_MORPH":"",e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+h:"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.displacementMap?"#define USE_DISPLACEMENTMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.mapUv?"#define MAP_UV "+e.mapUv:"",e.alphaMapUv?"#define ALPHAMAP_UV "+e.alphaMapUv:"",e.lightMapUv?"#define LIGHTMAP_UV "+e.lightMapUv:"",e.aoMapUv?"#define AOMAP_UV "+e.aoMapUv:"",e.emissiveMapUv?"#define EMISSIVEMAP_UV "+e.emissiveMapUv:"",e.bumpMapUv?"#define BUMPMAP_UV "+e.bumpMapUv:"",e.normalMapUv?"#define NORMALMAP_UV "+e.normalMapUv:"",e.displacementMapUv?"#define DISPLACEMENTMAP_UV "+e.displacementMapUv:"",e.metalnessMapUv?"#define METALNESSMAP_UV "+e.metalnessMapUv:"",e.roughnessMapUv?"#define ROUGHNESSMAP_UV "+e.roughnessMapUv:"",e.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+e.anisotropyMapUv:"",e.clearcoatMapUv?"#define CLEARCOATMAP_UV "+e.clearcoatMapUv:"",e.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+e.clearcoatNormalMapUv:"",e.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+e.clearcoatRoughnessMapUv:"",e.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+e.iridescenceMapUv:"",e.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+e.iridescenceThicknessMapUv:"",e.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+e.sheenColorMapUv:"",e.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+e.sheenRoughnessMapUv:"",e.specularMapUv?"#define SPECULARMAP_UV "+e.specularMapUv:"",e.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+e.specularColorMapUv:"",e.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+e.specularIntensityMapUv:"",e.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+e.transmissionMapUv:"",e.thicknessMapUv?"#define THICKNESSMAP_UV "+e.thicknessMapUv:"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexNormals?"#define HAS_NORMAL":"",e.vertexColors?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.flatShading?"#define FLAT_SHADED":"",e.skinning?"#define USE_SKINNING":"",e.morphTargets?"#define USE_MORPHTARGETS":"",e.morphNormals&&e.flatShading===!1?"#define USE_MORPHNORMALS":"",e.morphColors?"#define USE_MORPHCOLORS":"",e.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+e.morphTextureStride:"",e.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+e.morphTargetsCount:"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.sizeAttenuation?"#define USE_SIZEATTENUATION":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Us).join(`
`),p=[Kc(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,m,e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",e.map?"#define USE_MAP":"",e.matcap?"#define USE_MATCAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+c:"",e.envMap?"#define "+h:"",e.envMap?"#define "+d:"",u?"#define CUBEUV_TEXEL_WIDTH "+u.texelWidth:"",u?"#define CUBEUV_TEXEL_HEIGHT "+u.texelHeight:"",u?"#define CUBEUV_MAX_MIP "+u.maxMip+".0":"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoat?"#define USE_CLEARCOAT":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.dispersion?"#define USE_DISPERSION":"",e.iridescence?"#define USE_IRIDESCENCE":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaTest?"#define USE_ALPHATEST":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.sheen?"#define USE_SHEEN":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors||e.instancingColor?"#define USE_COLOR":"",e.vertexAlphas||e.batchingColor?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.gradientMap?"#define USE_GRADIENTMAP":"",e.flatShading?"#define FLAT_SHADED":"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",e.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",e.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",e.toneMapping!==sn?"#define TONE_MAPPING":"",e.toneMapping!==sn?qt.tonemapping_pars_fragment:"",e.toneMapping!==sn?Em("toneMapping",e.toneMapping):"",e.dithering?"#define DITHERING":"",e.opaque?"#define OPAQUE":"",qt.colorspace_pars_fragment,Mm("linearToOutputTexel",e.outputColorSpace),wm(),e.useDepthPacking?"#define DEPTH_PACKING "+e.depthPacking:"",`
`].filter(Us).join(`
`)),o=al(o),o=$c(o,e),o=Zc(o,e),a=al(a),a=$c(a,e),a=Zc(a,e),o=Jc(o),a=Jc(a),e.isRawShaderMaterial!==!0&&(A=`#version 300 es
`,g=[f,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+g,p=["#define varying in",e.glslVersion===Wa?"":"layout(location = 0) out highp vec4 pc_fragColor;",e.glslVersion===Wa?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+p);let w=A+g+o,M=A+p+a,y=Xc(s,s.VERTEX_SHADER,w),S=Xc(s,s.FRAGMENT_SHADER,M);s.attachShader(v,y),s.attachShader(v,S),e.index0AttributeName!==void 0?s.bindAttribLocation(v,0,e.index0AttributeName):e.hasPositionAttribute===!0&&s.bindAttribLocation(v,0,"position"),s.linkProgram(v);function C(I){if(i.debug.checkShaderErrors){let L=s.getProgramInfoLog(v)||"",Y=s.getShaderInfoLog(y)||"",q=s.getShaderInfoLog(S)||"",O=L.trim(),z=Y.trim(),k=q.trim(),$=!0,et=!0;if(s.getProgramParameter(v,s.LINK_STATUS)===!1)if($=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(s,v,y,S);else{let rt=qc(s,y,"vertex"),ot=qc(s,S,"fragment");Ft("WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(v,s.VALIDATE_STATUS)+`

Material Name: `+I.name+`
Material Type: `+I.type+`

Program Info Log: `+O+`
`+rt+`
`+ot)}else O!==""?Nt("WebGLProgram: Program Info Log:",O):(z===""||k==="")&&(et=!1);et&&(I.diagnostics={runnable:$,programLog:O,vertexShader:{log:z,prefix:g},fragmentShader:{log:k,prefix:p}})}s.deleteShader(y),s.deleteShader(S),_=new ji(s,v),E=Cm(s,v)}let _;this.getUniforms=function(){return _===void 0&&C(this),_};let E;this.getAttributes=function(){return E===void 0&&C(this),E};let R=e.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return R===!1&&(R=s.getProgramParameter(v,_m)),R},this.destroy=function(){n.releaseStatesOfProgram(this),s.deleteProgram(v),this.program=void 0},this.type=e.shaderType,this.name=e.shaderName,this.id=vm++,this.cacheKey=t,this.usedTimes=1,this.program=v,this.vertexShader=y,this.fragmentShader=S,this}var Wm=0,ll=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t,e,n){let s=this._getShaderCacheForMaterial(t);return s.has(e)===!1&&(s.add(e),e.usedTimes++),s.has(n)===!1&&(s.add(n),n.usedTimes++),this}remove(t){let e=this.materialCache.get(t);for(let n of e)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(t),this}getVertexShaderStage(t){return this._getShaderStage(t.vertexShader)}getFragmentShaderStage(t){return this._getShaderStage(t.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){let e=this.materialCache,n=e.get(t);return n===void 0&&(n=new Set,e.set(t,n)),n}_getShaderStage(t){let e=this.shaderCache,n=e.get(t);return n===void 0&&(n=new cl(t),e.set(t,n)),n}},cl=class{constructor(t){this.id=Wm++,this.code=t,this.usedTimes=0}};function Xm(i){return i===jn||i===Ps||i===Ls}function Ym(i,t,e,n,s,r){let o=new Bi,a=new ll,l=new Set,c=[],h=new Map,d=n.logarithmicDepthBuffer,u=n.precision,f={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function m(_){return l.add(_),_===0?"uv":`uv${_}`}function v(_,E,R,I,L,Y){let q=I.fog,O=L.geometry,z=_.isMeshStandardMaterial||_.isMeshLambertMaterial||_.isMeshPhongMaterial?I.environment:null,k=_.isMeshStandardMaterial||_.isMeshLambertMaterial&&!_.envMap||_.isMeshPhongMaterial&&!_.envMap,$=t.get(_.envMap||z,k),et=$&&$.mapping===ws?$.image.height:null,rt=f[_.type];_.precision!==null&&(u=n.getMaxPrecision(_.precision),u!==_.precision&&Nt("WebGLProgram.getParameters:",_.precision,"not supported, using",u,"instead."));let ot=O.morphAttributes.position||O.morphAttributes.normal||O.morphAttributes.color,_t=ot!==void 0?ot.length:0,Vt=0;O.morphAttributes.position!==void 0&&(Vt=1),O.morphAttributes.normal!==void 0&&(Vt=2),O.morphAttributes.color!==void 0&&(Vt=3);let te,$t,j,at;if(rt){let Et=vn[rt];te=Et.vertexShader,$t=Et.fragmentShader}else{te=_.vertexShader,$t=_.fragmentShader;let Et=a.getVertexShaderStage(_),pe=a.getFragmentShaderStage(_);a.update(_,Et,pe),j=Et.id,at=pe.id}let it=i.getRenderTarget(),Ot=i.state.buffers.depth.getReversed(),kt=L.isInstancedMesh===!0,Lt=L.isBatchedMesh===!0,ce=!!_.map,Gt=!!_.matcap,ee=!!$,Ht=!!_.aoMap,Yt=!!_.lightMap,fe=!!_.bumpMap&&_.wireframe===!1,V=!!_.normalMap,K=!!_.displacementMap,vt=!!_.emissiveMap,yt=!!_.metalnessMap,St=!!_.roughnessMap,P=_.anisotropy>0,Dt=_.clearcoat>0,gt=_.dispersion>0,T=_.iridescence>0,x=_.sheen>0,U=_.transmission>0,D=P&&!!_.anisotropyMap,W=Dt&&!!_.clearcoatMap,nt=Dt&&!!_.clearcoatNormalMap,lt=Dt&&!!_.clearcoatRoughnessMap,Z=T&&!!_.iridescenceMap,J=T&&!!_.iridescenceThicknessMap,st=x&&!!_.sheenColorMap,At=x&&!!_.sheenRoughnessMap,dt=!!_.specularMap,ht=!!_.specularColorMap,Pt=!!_.specularIntensityMap,Ut=U&&!!_.transmissionMap,Wt=U&&!!_.thicknessMap,F=!!_.gradientMap,ct=!!_.alphaMap,Q=_.alphaTest>0,ut=!!_.alphaHash,xt=!!_.extensions,tt=sn;_.toneMapped&&(it===null||it.isXRRenderTarget===!0)&&(tt=i.toneMapping);let Tt={shaderID:rt,shaderType:_.type,shaderName:_.name,vertexShader:te,fragmentShader:$t,defines:_.defines,customVertexShaderID:j,customFragmentShaderID:at,isRawShaderMaterial:_.isRawShaderMaterial===!0,glslVersion:_.glslVersion,precision:u,batching:Lt,batchingColor:Lt&&L._colorsTexture!==null,instancing:kt,instancingColor:kt&&L.instanceColor!==null,instancingMorph:kt&&L.morphTexture!==null,outputColorSpace:it===null?i.outputColorSpace:it.isXRRenderTarget===!0?it.texture.colorSpace:Kt.workingColorSpace,alphaToCoverage:!!_.alphaToCoverage,map:ce,matcap:Gt,envMap:ee,envMapMode:ee&&$.mapping,envMapCubeUVHeight:et,aoMap:Ht,lightMap:Yt,bumpMap:fe,normalMap:V,displacementMap:K,emissiveMap:vt,normalMapObjectSpace:V&&_.normalMapType===yc,normalMapTangentSpace:V&&_.normalMapType===Ao,packedNormalMap:V&&_.normalMapType===Ao&&Xm(_.normalMap.format),metalnessMap:yt,roughnessMap:St,anisotropy:P,anisotropyMap:D,clearcoat:Dt,clearcoatMap:W,clearcoatNormalMap:nt,clearcoatRoughnessMap:lt,dispersion:gt,iridescence:T,iridescenceMap:Z,iridescenceThicknessMap:J,sheen:x,sheenColorMap:st,sheenRoughnessMap:At,specularMap:dt,specularColorMap:ht,specularIntensityMap:Pt,transmission:U,transmissionMap:Ut,thicknessMap:Wt,gradientMap:F,opaque:_.transparent===!1&&_.blending===li&&_.alphaToCoverage===!1,alphaMap:ct,alphaTest:Q,alphaHash:ut,combine:_.combine,mapUv:ce&&m(_.map.channel),aoMapUv:Ht&&m(_.aoMap.channel),lightMapUv:Yt&&m(_.lightMap.channel),bumpMapUv:fe&&m(_.bumpMap.channel),normalMapUv:V&&m(_.normalMap.channel),displacementMapUv:K&&m(_.displacementMap.channel),emissiveMapUv:vt&&m(_.emissiveMap.channel),metalnessMapUv:yt&&m(_.metalnessMap.channel),roughnessMapUv:St&&m(_.roughnessMap.channel),anisotropyMapUv:D&&m(_.anisotropyMap.channel),clearcoatMapUv:W&&m(_.clearcoatMap.channel),clearcoatNormalMapUv:nt&&m(_.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:lt&&m(_.clearcoatRoughnessMap.channel),iridescenceMapUv:Z&&m(_.iridescenceMap.channel),iridescenceThicknessMapUv:J&&m(_.iridescenceThicknessMap.channel),sheenColorMapUv:st&&m(_.sheenColorMap.channel),sheenRoughnessMapUv:At&&m(_.sheenRoughnessMap.channel),specularMapUv:dt&&m(_.specularMap.channel),specularColorMapUv:ht&&m(_.specularColorMap.channel),specularIntensityMapUv:Pt&&m(_.specularIntensityMap.channel),transmissionMapUv:Ut&&m(_.transmissionMap.channel),thicknessMapUv:Wt&&m(_.thicknessMap.channel),alphaMapUv:ct&&m(_.alphaMap.channel),vertexTangents:!!O.attributes.tangent&&(V||P),vertexNormals:!!O.attributes.normal,vertexColors:_.vertexColors,vertexAlphas:_.vertexColors===!0&&!!O.attributes.color&&O.attributes.color.itemSize===4,pointsUvs:L.isPoints===!0&&!!O.attributes.uv&&(ce||ct),fog:!!q,useFog:_.fog===!0,fogExp2:!!q&&q.isFogExp2,flatShading:_.wireframe===!1&&(_.flatShading===!0||O.attributes.normal===void 0&&V===!1&&(_.isMeshLambertMaterial||_.isMeshPhongMaterial||_.isMeshStandardMaterial||_.isMeshPhysicalMaterial)),sizeAttenuation:_.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:Ot,skinning:L.isSkinnedMesh===!0,hasPositionAttribute:O.attributes.position!==void 0,morphTargets:O.morphAttributes.position!==void 0,morphNormals:O.morphAttributes.normal!==void 0,morphColors:O.morphAttributes.color!==void 0,morphTargetsCount:_t,morphTextureStride:Vt,numDirLights:E.directional.length,numPointLights:E.point.length,numSpotLights:E.spot.length,numSpotLightMaps:E.spotLightMap.length,numRectAreaLights:E.rectArea.length,numHemiLights:E.hemi.length,numDirLightShadows:E.directionalShadowMap.length,numPointLightShadows:E.pointShadowMap.length,numSpotLightShadows:E.spotShadowMap.length,numSpotLightShadowsWithMaps:E.numSpotLightShadowsWithMaps,numLightProbes:E.numLightProbes,numLightProbeGrids:Y.length,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:_.dithering,shadowMapEnabled:i.shadowMap.enabled&&R.length>0,shadowMapType:i.shadowMap.type,toneMapping:tt,decodeVideoTexture:ce&&_.map.isVideoTexture===!0&&Kt.getTransfer(_.map.colorSpace)===ne,decodeVideoTextureEmissive:vt&&_.emissiveMap.isVideoTexture===!0&&Kt.getTransfer(_.emissiveMap.colorSpace)===ne,premultipliedAlpha:_.premultipliedAlpha,doubleSided:_.side===Fe,flipSided:_.side===Ae,useDepthPacking:_.depthPacking>=0,depthPacking:_.depthPacking||0,index0AttributeName:_.index0AttributeName,extensionClipCullDistance:xt&&_.extensions.clipCullDistance===!0&&e.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(xt&&_.extensions.multiDraw===!0||Lt)&&e.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:e.has("KHR_parallel_shader_compile"),customProgramCacheKey:_.customProgramCacheKey()};return Tt.vertexUv1s=l.has(1),Tt.vertexUv2s=l.has(2),Tt.vertexUv3s=l.has(3),l.clear(),Tt}function g(_){let E=[];if(_.shaderID?E.push(_.shaderID):(E.push(_.customVertexShaderID),E.push(_.customFragmentShaderID)),_.defines!==void 0)for(let R in _.defines)E.push(R),E.push(_.defines[R]);return _.isRawShaderMaterial===!1&&(p(E,_),A(E,_),E.push(i.outputColorSpace)),E.push(_.customProgramCacheKey),E.join()}function p(_,E){_.push(E.precision),_.push(E.outputColorSpace),_.push(E.envMapMode),_.push(E.envMapCubeUVHeight),_.push(E.mapUv),_.push(E.alphaMapUv),_.push(E.lightMapUv),_.push(E.aoMapUv),_.push(E.bumpMapUv),_.push(E.normalMapUv),_.push(E.displacementMapUv),_.push(E.emissiveMapUv),_.push(E.metalnessMapUv),_.push(E.roughnessMapUv),_.push(E.anisotropyMapUv),_.push(E.clearcoatMapUv),_.push(E.clearcoatNormalMapUv),_.push(E.clearcoatRoughnessMapUv),_.push(E.iridescenceMapUv),_.push(E.iridescenceThicknessMapUv),_.push(E.sheenColorMapUv),_.push(E.sheenRoughnessMapUv),_.push(E.specularMapUv),_.push(E.specularColorMapUv),_.push(E.specularIntensityMapUv),_.push(E.transmissionMapUv),_.push(E.thicknessMapUv),_.push(E.combine),_.push(E.fogExp2),_.push(E.sizeAttenuation),_.push(E.morphTargetsCount),_.push(E.morphAttributeCount),_.push(E.numDirLights),_.push(E.numPointLights),_.push(E.numSpotLights),_.push(E.numSpotLightMaps),_.push(E.numHemiLights),_.push(E.numRectAreaLights),_.push(E.numDirLightShadows),_.push(E.numPointLightShadows),_.push(E.numSpotLightShadows),_.push(E.numSpotLightShadowsWithMaps),_.push(E.numLightProbes),_.push(E.shadowMapType),_.push(E.toneMapping),_.push(E.numClippingPlanes),_.push(E.numClipIntersection),_.push(E.depthPacking)}function A(_,E){o.disableAll(),E.instancing&&o.enable(0),E.instancingColor&&o.enable(1),E.instancingMorph&&o.enable(2),E.matcap&&o.enable(3),E.envMap&&o.enable(4),E.normalMapObjectSpace&&o.enable(5),E.normalMapTangentSpace&&o.enable(6),E.clearcoat&&o.enable(7),E.iridescence&&o.enable(8),E.alphaTest&&o.enable(9),E.vertexColors&&o.enable(10),E.vertexAlphas&&o.enable(11),E.vertexUv1s&&o.enable(12),E.vertexUv2s&&o.enable(13),E.vertexUv3s&&o.enable(14),E.vertexTangents&&o.enable(15),E.anisotropy&&o.enable(16),E.alphaHash&&o.enable(17),E.batching&&o.enable(18),E.dispersion&&o.enable(19),E.batchingColor&&o.enable(20),E.gradientMap&&o.enable(21),E.packedNormalMap&&o.enable(22),E.vertexNormals&&o.enable(23),_.push(o.mask),o.disableAll(),E.fog&&o.enable(0),E.useFog&&o.enable(1),E.flatShading&&o.enable(2),E.logarithmicDepthBuffer&&o.enable(3),E.reversedDepthBuffer&&o.enable(4),E.skinning&&o.enable(5),E.morphTargets&&o.enable(6),E.morphNormals&&o.enable(7),E.morphColors&&o.enable(8),E.premultipliedAlpha&&o.enable(9),E.shadowMapEnabled&&o.enable(10),E.doubleSided&&o.enable(11),E.flipSided&&o.enable(12),E.useDepthPacking&&o.enable(13),E.dithering&&o.enable(14),E.transmission&&o.enable(15),E.sheen&&o.enable(16),E.opaque&&o.enable(17),E.pointsUvs&&o.enable(18),E.decodeVideoTexture&&o.enable(19),E.decodeVideoTextureEmissive&&o.enable(20),E.alphaToCoverage&&o.enable(21),E.numLightProbeGrids>0&&o.enable(22),E.hasPositionAttribute&&o.enable(23),_.push(o.mask)}function w(_){let E=f[_.type],R;if(E){let I=vn[E];R=Lc.clone(I.uniforms)}else R=_.uniforms;return R}function M(_,E){let R=h.get(E);return R!==void 0?++R.usedTimes:(R=new Gm(i,E,_,s),c.push(R),h.set(E,R)),R}function y(_){if(--_.usedTimes===0){let E=c.indexOf(_);c[E]=c[c.length-1],c.pop(),h.delete(_.cacheKey),_.destroy()}}function S(_){a.remove(_)}function C(){a.dispose()}return{getParameters:v,getProgramCacheKey:g,getUniforms:w,acquireProgram:M,releaseProgram:y,releaseShaderCache:S,programs:c,dispose:C}}function qm(){let i=new WeakMap;function t(o){return i.has(o)}function e(o){let a=i.get(o);return a===void 0&&(a={},i.set(o,a)),a}function n(o){i.delete(o)}function s(o,a,l){i.get(o)[a]=l}function r(){i=new WeakMap}return{has:t,get:e,remove:n,update:s,dispose:r}}function $m(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.material.id!==t.material.id?i.material.id-t.material.id:i.materialVariant!==t.materialVariant?i.materialVariant-t.materialVariant:i.z!==t.z?i.z-t.z:i.id-t.id}function jc(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.z!==t.z?t.z-i.z:i.id-t.id}function Qc(){let i=[],t=0,e=[],n=[],s=[];function r(){t=0,e.length=0,n.length=0,s.length=0}function o(u){let f=0;return u.isInstancedMesh&&(f+=2),u.isSkinnedMesh&&(f+=1),f}function a(u,f,m,v,g,p){let A=i[t];return A===void 0?(A={id:u.id,object:u,geometry:f,material:m,materialVariant:o(u),groupOrder:v,renderOrder:u.renderOrder,z:g,group:p},i[t]=A):(A.id=u.id,A.object=u,A.geometry=f,A.material=m,A.materialVariant=o(u),A.groupOrder=v,A.renderOrder=u.renderOrder,A.z=g,A.group=p),t++,A}function l(u,f,m,v,g,p){let A=a(u,f,m,v,g,p);m.transmission>0?n.push(A):m.transparent===!0?s.push(A):e.push(A)}function c(u,f,m,v,g,p){let A=a(u,f,m,v,g,p);m.transmission>0?n.unshift(A):m.transparent===!0?s.unshift(A):e.unshift(A)}function h(u,f,m){e.length>1&&e.sort(u||$m),n.length>1&&n.sort(f||jc),s.length>1&&s.sort(f||jc),m&&(e.reverse(),n.reverse(),s.reverse())}function d(){for(let u=t,f=i.length;u<f;u++){let m=i[u];if(m.id===null)break;m.id=null,m.object=null,m.geometry=null,m.material=null,m.group=null}}return{opaque:e,transmissive:n,transparent:s,init:r,push:l,unshift:c,finish:d,sort:h}}function Zm(){let i=new WeakMap;function t(n,s){let r=i.get(n),o;return r===void 0?(o=new Qc,i.set(n,[o])):s>=r.length?(o=new Qc,r.push(o)):o=r[s],o}function e(){i=new WeakMap}return{get:t,dispose:e}}function Jm(){let i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"DirectionalLight":e={direction:new N,color:new zt};break;case"SpotLight":e={position:new N,direction:new N,color:new zt,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":e={position:new N,color:new zt,distance:0,decay:0};break;case"HemisphereLight":e={direction:new N,skyColor:new zt,groundColor:new zt};break;case"RectAreaLight":e={color:new zt,position:new N,halfWidth:new N,halfHeight:new N};break}return i[t.id]=e,e}}}function Km(){let i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"DirectionalLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Jt};break;case"SpotLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Jt};break;case"PointLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Jt,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[t.id]=e,e}}}var jm=0;function Qm(i,t){return(t.castShadow?2:0)-(i.castShadow?2:0)+(t.map?1:0)-(i.map?1:0)}function tg(i){let t=new Jm,e=Km(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new N);let s=new N,r=new ue,o=new ue;function a(c){let h=0,d=0,u=0;for(let E=0;E<9;E++)n.probe[E].set(0,0,0);let f=0,m=0,v=0,g=0,p=0,A=0,w=0,M=0,y=0,S=0,C=0;c.sort(Qm);for(let E=0,R=c.length;E<R;E++){let I=c[E],L=I.color,Y=I.intensity,q=I.distance,O=null;if(I.shadow&&I.shadow.map&&(I.shadow.map.texture.format===jn?O=I.shadow.map.texture:O=I.shadow.map.depthTexture||I.shadow.map.texture),I.isAmbientLight)h+=L.r*Y,d+=L.g*Y,u+=L.b*Y;else if(I.isLightProbe){for(let z=0;z<9;z++)n.probe[z].addScaledVector(I.sh.coefficients[z],Y);C++}else if(I.isDirectionalLight){let z=t.get(I);if(z.color.copy(I.color).multiplyScalar(I.intensity),I.castShadow){let k=I.shadow,$=e.get(I);$.shadowIntensity=k.intensity,$.shadowBias=k.bias,$.shadowNormalBias=k.normalBias,$.shadowRadius=k.radius,$.shadowMapSize=k.mapSize,n.directionalShadow[f]=$,n.directionalShadowMap[f]=O,n.directionalShadowMatrix[f]=I.shadow.matrix,A++}n.directional[f]=z,f++}else if(I.isSpotLight){let z=t.get(I);z.position.setFromMatrixPosition(I.matrixWorld),z.color.copy(L).multiplyScalar(Y),z.distance=q,z.coneCos=Math.cos(I.angle),z.penumbraCos=Math.cos(I.angle*(1-I.penumbra)),z.decay=I.decay,n.spot[v]=z;let k=I.shadow;if(I.map&&(n.spotLightMap[y]=I.map,y++,k.updateMatrices(I),I.castShadow&&S++),n.spotLightMatrix[v]=k.matrix,I.castShadow){let $=e.get(I);$.shadowIntensity=k.intensity,$.shadowBias=k.bias,$.shadowNormalBias=k.normalBias,$.shadowRadius=k.radius,$.shadowMapSize=k.mapSize,n.spotShadow[v]=$,n.spotShadowMap[v]=O,M++}v++}else if(I.isRectAreaLight){let z=t.get(I);z.color.copy(L).multiplyScalar(Y),z.halfWidth.set(I.width*.5,0,0),z.halfHeight.set(0,I.height*.5,0),n.rectArea[g]=z,g++}else if(I.isPointLight){let z=t.get(I);if(z.color.copy(I.color).multiplyScalar(I.intensity),z.distance=I.distance,z.decay=I.decay,I.castShadow){let k=I.shadow,$=e.get(I);$.shadowIntensity=k.intensity,$.shadowBias=k.bias,$.shadowNormalBias=k.normalBias,$.shadowRadius=k.radius,$.shadowMapSize=k.mapSize,$.shadowCameraNear=k.camera.near,$.shadowCameraFar=k.camera.far,n.pointShadow[m]=$,n.pointShadowMap[m]=O,n.pointShadowMatrix[m]=I.shadow.matrix,w++}n.point[m]=z,m++}else if(I.isHemisphereLight){let z=t.get(I);z.skyColor.copy(I.color).multiplyScalar(Y),z.groundColor.copy(I.groundColor).multiplyScalar(Y),n.hemi[p]=z,p++}}g>0&&(i.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=ft.LTC_FLOAT_1,n.rectAreaLTC2=ft.LTC_FLOAT_2):(n.rectAreaLTC1=ft.LTC_HALF_1,n.rectAreaLTC2=ft.LTC_HALF_2)),n.ambient[0]=h,n.ambient[1]=d,n.ambient[2]=u;let _=n.hash;(_.directionalLength!==f||_.pointLength!==m||_.spotLength!==v||_.rectAreaLength!==g||_.hemiLength!==p||_.numDirectionalShadows!==A||_.numPointShadows!==w||_.numSpotShadows!==M||_.numSpotMaps!==y||_.numLightProbes!==C)&&(n.directional.length=f,n.spot.length=v,n.rectArea.length=g,n.point.length=m,n.hemi.length=p,n.directionalShadow.length=A,n.directionalShadowMap.length=A,n.pointShadow.length=w,n.pointShadowMap.length=w,n.spotShadow.length=M,n.spotShadowMap.length=M,n.directionalShadowMatrix.length=A,n.pointShadowMatrix.length=w,n.spotLightMatrix.length=M+y-S,n.spotLightMap.length=y,n.numSpotLightShadowsWithMaps=S,n.numLightProbes=C,_.directionalLength=f,_.pointLength=m,_.spotLength=v,_.rectAreaLength=g,_.hemiLength=p,_.numDirectionalShadows=A,_.numPointShadows=w,_.numSpotShadows=M,_.numSpotMaps=y,_.numLightProbes=C,n.version=jm++)}function l(c,h){let d=0,u=0,f=0,m=0,v=0,g=h.matrixWorldInverse;for(let p=0,A=c.length;p<A;p++){let w=c[p];if(w.isDirectionalLight){let M=n.directional[d];M.direction.setFromMatrixPosition(w.matrixWorld),s.setFromMatrixPosition(w.target.matrixWorld),M.direction.sub(s),M.direction.transformDirection(g),d++}else if(w.isSpotLight){let M=n.spot[f];M.position.setFromMatrixPosition(w.matrixWorld),M.position.applyMatrix4(g),M.direction.setFromMatrixPosition(w.matrixWorld),s.setFromMatrixPosition(w.target.matrixWorld),M.direction.sub(s),M.direction.transformDirection(g),f++}else if(w.isRectAreaLight){let M=n.rectArea[m];M.position.setFromMatrixPosition(w.matrixWorld),M.position.applyMatrix4(g),o.identity(),r.copy(w.matrixWorld),r.premultiply(g),o.extractRotation(r),M.halfWidth.set(w.width*.5,0,0),M.halfHeight.set(0,w.height*.5,0),M.halfWidth.applyMatrix4(o),M.halfHeight.applyMatrix4(o),m++}else if(w.isPointLight){let M=n.point[u];M.position.setFromMatrixPosition(w.matrixWorld),M.position.applyMatrix4(g),u++}else if(w.isHemisphereLight){let M=n.hemi[v];M.direction.setFromMatrixPosition(w.matrixWorld),M.direction.transformDirection(g),v++}}}return{setup:a,setupView:l,state:n}}function th(i){let t=new tg(i),e=[],n=[],s=[];function r(u){d.camera=u,e.length=0,n.length=0,s.length=0}function o(u){e.push(u)}function a(u){n.push(u)}function l(u){s.push(u)}function c(){t.setup(e)}function h(u){t.setupView(e,u)}let d={lightsArray:e,shadowsArray:n,lightProbeGridArray:s,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:r,state:d,setupLights:c,setupLightsView:h,pushLight:o,pushShadow:a,pushLightProbeGrid:l}}function eg(i){let t=new WeakMap;function e(s,r=0){let o=t.get(s),a;return o===void 0?(a=new th(i),t.set(s,[a])):r>=o.length?(a=new th(i),o.push(a)):a=o[r],a}function n(){t=new WeakMap}return{get:e,dispose:n}}var ng=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,ig=`uniform sampler2D shadow_pass;
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
}`,sg=[new N(1,0,0),new N(-1,0,0),new N(0,1,0),new N(0,-1,0),new N(0,0,1),new N(0,0,-1)],rg=[new N(0,-1,0),new N(0,-1,0),new N(0,0,1),new N(0,0,-1),new N(0,-1,0),new N(0,-1,0)],eh=new ue,Ns=new N,nl=new N;function og(i,t,e){let n=new ki,s=new Jt,r=new Jt,o=new de,a=new Ar,l=new Cr,c={},h=e.maxTextureSize,d={[An]:Ae,[Ae]:An,[Fe]:Fe},u=new Ue({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Jt},radius:{value:4}},vertexShader:ng,fragmentShader:ig}),f=u.clone();f.defines.HORIZONTAL_PASS=1;let m=new ze;m.setAttribute("position",new ye(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let v=new ge(m,u),g=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Es;let p=this.type;this.render=function(S,C,_){if(g.enabled===!1||g.autoUpdate===!1&&g.needsUpdate===!1||S.length===0)return;this.type===Kl&&(Nt("WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead."),this.type=Es);let E=i.getRenderTarget(),R=i.getActiveCubeFace(),I=i.getActiveMipmapLevel(),L=i.state;L.setBlending(gn),L.buffers.depth.getReversed()===!0?L.buffers.color.setClear(0,0,0,0):L.buffers.color.setClear(1,1,1,1),L.buffers.depth.setTest(!0),L.setScissorTest(!1);let Y=p!==this.type;Y&&C.traverse(function(q){q.material&&(Array.isArray(q.material)?q.material.forEach(O=>O.needsUpdate=!0):q.material.needsUpdate=!0)});for(let q=0,O=S.length;q<O;q++){let z=S[q],k=z.shadow;if(k===void 0){Nt("WebGLShadowMap:",z,"has no shadow.");continue}if(k.autoUpdate===!1&&k.needsUpdate===!1)continue;s.copy(k.mapSize);let $=k.getFrameExtents();s.multiply($),r.copy(k.mapSize),(s.x>h||s.y>h)&&(s.x>h&&(r.x=Math.floor(h/$.x),s.x=r.x*$.x,k.mapSize.x=r.x),s.y>h&&(r.y=Math.floor(h/$.y),s.y=r.y*$.y,k.mapSize.y=r.y));let et=i.state.buffers.depth.getReversed();if(k.camera._reversedDepth=et,k.map===null||Y===!0){if(k.map!==null&&(k.map.depthTexture!==null&&(k.map.depthTexture.dispose(),k.map.depthTexture=null),k.map.dispose()),this.type===qi){if(z.isPointLight){Nt("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}k.map=new Xe(s.x,s.y,{format:jn,type:xn,minFilter:Te,magFilter:Te,generateMipmaps:!1}),k.map.texture.name=z.name+".shadowMap",k.map.depthTexture=new Rn(s.x,s.y,on),k.map.depthTexture.name=z.name+".shadowMapDepth",k.map.depthTexture.format=fn,k.map.depthTexture.compareFunction=null,k.map.depthTexture.minFilter=we,k.map.depthTexture.magFilter=we}else z.isPointLight?(k.map=new Do(s.x),k.map.depthTexture=new wr(s.x,rn)):(k.map=new Xe(s.x,s.y),k.map.depthTexture=new Rn(s.x,s.y,rn)),k.map.depthTexture.name=z.name+".shadowMap",k.map.depthTexture.format=fn,this.type===Es?(k.map.depthTexture.compareFunction=et?Ro:Co,k.map.depthTexture.minFilter=Te,k.map.depthTexture.magFilter=Te):(k.map.depthTexture.compareFunction=null,k.map.depthTexture.minFilter=we,k.map.depthTexture.magFilter=we);k.camera.updateProjectionMatrix()}let rt=k.map.isWebGLCubeRenderTarget?6:1;for(let ot=0;ot<rt;ot++){if(k.map.isWebGLCubeRenderTarget)i.setRenderTarget(k.map,ot),i.clear();else{ot===0&&(i.setRenderTarget(k.map),i.clear());let _t=k.getViewport(ot);o.set(r.x*_t.x,r.y*_t.y,r.x*_t.z,r.y*_t.w),L.viewport(o)}if(z.isPointLight){let _t=k.camera,Vt=k.matrix,te=z.distance||_t.far;te!==_t.far&&(_t.far=te,_t.updateProjectionMatrix()),Ns.setFromMatrixPosition(z.matrixWorld),_t.position.copy(Ns),nl.copy(_t.position),nl.add(sg[ot]),_t.up.copy(rg[ot]),_t.lookAt(nl),_t.updateMatrixWorld(),Vt.makeTranslation(-Ns.x,-Ns.y,-Ns.z),eh.multiplyMatrices(_t.projectionMatrix,_t.matrixWorldInverse),k._frustum.setFromProjectionMatrix(eh,_t.coordinateSystem,_t.reversedDepth)}else k.updateMatrices(z);n=k.getFrustum(),M(C,_,k.camera,z,this.type)}k.isPointLightShadow!==!0&&this.type===qi&&A(k,_),k.needsUpdate=!1}p=this.type,g.needsUpdate=!1,i.setRenderTarget(E,R,I)};function A(S,C){let _=t.update(v);u.defines.VSM_SAMPLES!==S.blurSamples&&(u.defines.VSM_SAMPLES=S.blurSamples,f.defines.VSM_SAMPLES=S.blurSamples,u.needsUpdate=!0,f.needsUpdate=!0),S.mapPass===null&&(S.mapPass=new Xe(s.x,s.y,{format:jn,type:xn})),u.uniforms.shadow_pass.value=S.map.depthTexture,u.uniforms.resolution.value=S.mapSize,u.uniforms.radius.value=S.radius,i.setRenderTarget(S.mapPass),i.clear(),i.renderBufferDirect(C,null,_,u,v,null),f.uniforms.shadow_pass.value=S.mapPass.texture,f.uniforms.resolution.value=S.mapSize,f.uniforms.radius.value=S.radius,i.setRenderTarget(S.map),i.clear(),i.renderBufferDirect(C,null,_,f,v,null)}function w(S,C,_,E){let R=null,I=_.isPointLight===!0?S.customDistanceMaterial:S.customDepthMaterial;if(I!==void 0)R=I;else if(R=_.isPointLight===!0?l:a,i.localClippingEnabled&&C.clipShadows===!0&&Array.isArray(C.clippingPlanes)&&C.clippingPlanes.length!==0||C.displacementMap&&C.displacementScale!==0||C.alphaMap&&C.alphaTest>0||C.map&&C.alphaTest>0||C.alphaToCoverage===!0){let L=R.uuid,Y=C.uuid,q=c[L];q===void 0&&(q={},c[L]=q);let O=q[Y];O===void 0&&(O=R.clone(),q[Y]=O,C.addEventListener("dispose",y)),R=O}if(R.visible=C.visible,R.wireframe=C.wireframe,E===qi?R.side=C.shadowSide!==null?C.shadowSide:C.side:R.side=C.shadowSide!==null?C.shadowSide:d[C.side],R.alphaMap=C.alphaMap,R.alphaTest=C.alphaToCoverage===!0?.5:C.alphaTest,R.map=C.map,R.clipShadows=C.clipShadows,R.clippingPlanes=C.clippingPlanes,R.clipIntersection=C.clipIntersection,R.displacementMap=C.displacementMap,R.displacementScale=C.displacementScale,R.displacementBias=C.displacementBias,R.wireframeLinewidth=C.wireframeLinewidth,R.linewidth=C.linewidth,_.isPointLight===!0&&R.isMeshDistanceMaterial===!0){let L=i.properties.get(R);L.light=_}return R}function M(S,C,_,E,R){if(S.visible===!1)return;if(S.layers.test(C.layers)&&(S.isMesh||S.isLine||S.isPoints)&&(S.castShadow||S.receiveShadow&&R===qi)&&(!S.frustumCulled||n.intersectsObject(S))){S.modelViewMatrix.multiplyMatrices(_.matrixWorldInverse,S.matrixWorld);let Y=t.update(S),q=S.material;if(Array.isArray(q)){let O=Y.groups;for(let z=0,k=O.length;z<k;z++){let $=O[z],et=q[$.materialIndex];if(et&&et.visible){let rt=w(S,et,E,R);S.onBeforeShadow(i,S,C,_,Y,rt,$),i.renderBufferDirect(_,null,Y,rt,S,$),S.onAfterShadow(i,S,C,_,Y,rt,$)}}}else if(q.visible){let O=w(S,q,E,R);S.onBeforeShadow(i,S,C,_,Y,O,null),i.renderBufferDirect(_,null,Y,O,S,null),S.onAfterShadow(i,S,C,_,Y,O,null)}}let L=S.children;for(let Y=0,q=L.length;Y<q;Y++)M(L[Y],C,_,E,R)}function y(S){S.target.removeEventListener("dispose",y);for(let _ in c){let E=c[_],R=S.target.uuid;R in E&&(E[R].dispose(),delete E[R])}}}function ag(i,t){function e(){let F=!1,ct=new de,Q=null,ut=new de(0,0,0,0);return{setMask:function(xt){Q!==xt&&!F&&(i.colorMask(xt,xt,xt,xt),Q=xt)},setLocked:function(xt){F=xt},setClear:function(xt,tt,Tt,Et,pe){pe===!0&&(xt*=Et,tt*=Et,Tt*=Et),ct.set(xt,tt,Tt,Et),ut.equals(ct)===!1&&(i.clearColor(xt,tt,Tt,Et),ut.copy(ct))},reset:function(){F=!1,Q=null,ut.set(-1,0,0,0)}}}function n(){let F=!1,ct=!1,Q=null,ut=null,xt=null;return{setReversed:function(tt){if(ct!==tt){let Tt=t.get("EXT_clip_control");tt?Tt.clipControlEXT(Tt.LOWER_LEFT_EXT,Tt.ZERO_TO_ONE_EXT):Tt.clipControlEXT(Tt.LOWER_LEFT_EXT,Tt.NEGATIVE_ONE_TO_ONE_EXT),ct=tt;let Et=xt;xt=null,this.setClear(Et)}},getReversed:function(){return ct},setTest:function(tt){tt?it(i.DEPTH_TEST):Ot(i.DEPTH_TEST)},setMask:function(tt){Q!==tt&&!F&&(i.depthMask(tt),Q=tt)},setFunc:function(tt){if(ct&&(tt=Ic[tt]),ut!==tt){switch(tt){case ur:i.depthFunc(i.NEVER);break;case dr:i.depthFunc(i.ALWAYS);break;case fr:i.depthFunc(i.LESS);break;case ci:i.depthFunc(i.LEQUAL);break;case pr:i.depthFunc(i.EQUAL);break;case mr:i.depthFunc(i.GEQUAL);break;case gr:i.depthFunc(i.GREATER);break;case xr:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}ut=tt}},setLocked:function(tt){F=tt},setClear:function(tt){xt!==tt&&(xt=tt,ct&&(tt=1-tt),i.clearDepth(tt))},reset:function(){F=!1,Q=null,ut=null,xt=null,ct=!1}}}function s(){let F=!1,ct=null,Q=null,ut=null,xt=null,tt=null,Tt=null,Et=null,pe=null;return{setTest:function(ae){F||(ae?it(i.STENCIL_TEST):Ot(i.STENCIL_TEST))},setMask:function(ae){ct!==ae&&!F&&(i.stencilMask(ae),ct=ae)},setFunc:function(ae,ln,cn){(Q!==ae||ut!==ln||xt!==cn)&&(i.stencilFunc(ae,ln,cn),Q=ae,ut=ln,xt=cn)},setOp:function(ae,ln,cn){(tt!==ae||Tt!==ln||Et!==cn)&&(i.stencilOp(ae,ln,cn),tt=ae,Tt=ln,Et=cn)},setLocked:function(ae){F=ae},setClear:function(ae){pe!==ae&&(i.clearStencil(ae),pe=ae)},reset:function(){F=!1,ct=null,Q=null,ut=null,xt=null,tt=null,Tt=null,Et=null,pe=null}}}let r=new e,o=new n,a=new s,l=new WeakMap,c=new WeakMap,h={},d={},u={},f=new WeakMap,m=[],v=null,g=!1,p=null,A=null,w=null,M=null,y=null,S=null,C=null,_=new zt(0,0,0),E=0,R=!1,I=null,L=null,Y=null,q=null,O=null,z=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS),k=!1,$=0,et=i.getParameter(i.VERSION);et.indexOf("WebGL")!==-1?($=parseFloat(/^WebGL (\d)/.exec(et)[1]),k=$>=1):et.indexOf("OpenGL ES")!==-1&&($=parseFloat(/^OpenGL ES (\d)/.exec(et)[1]),k=$>=2);let rt=null,ot={},_t=i.getParameter(i.SCISSOR_BOX),Vt=i.getParameter(i.VIEWPORT),te=new de().fromArray(_t),$t=new de().fromArray(Vt);function j(F,ct,Q,ut){let xt=new Uint8Array(4),tt=i.createTexture();i.bindTexture(F,tt),i.texParameteri(F,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(F,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let Tt=0;Tt<Q;Tt++)F===i.TEXTURE_3D||F===i.TEXTURE_2D_ARRAY?i.texImage3D(ct,0,i.RGBA,1,1,ut,0,i.RGBA,i.UNSIGNED_BYTE,xt):i.texImage2D(ct+Tt,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,xt);return tt}let at={};at[i.TEXTURE_2D]=j(i.TEXTURE_2D,i.TEXTURE_2D,1),at[i.TEXTURE_CUBE_MAP]=j(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),at[i.TEXTURE_2D_ARRAY]=j(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),at[i.TEXTURE_3D]=j(i.TEXTURE_3D,i.TEXTURE_3D,1,1),r.setClear(0,0,0,1),o.setClear(1),a.setClear(0),it(i.DEPTH_TEST),o.setFunc(ci),fe(!1),V(Sa),it(i.CULL_FACE),Ht(gn);function it(F){h[F]!==!0&&(i.enable(F),h[F]=!0)}function Ot(F){h[F]!==!1&&(i.disable(F),h[F]=!1)}function kt(F,ct){return u[F]!==ct?(i.bindFramebuffer(F,ct),u[F]=ct,F===i.DRAW_FRAMEBUFFER&&(u[i.FRAMEBUFFER]=ct),F===i.FRAMEBUFFER&&(u[i.DRAW_FRAMEBUFFER]=ct),!0):!1}function Lt(F,ct){let Q=m,ut=!1;if(F){Q=f.get(ct),Q===void 0&&(Q=[],f.set(ct,Q));let xt=F.textures;if(Q.length!==xt.length||Q[0]!==i.COLOR_ATTACHMENT0){for(let tt=0,Tt=xt.length;tt<Tt;tt++)Q[tt]=i.COLOR_ATTACHMENT0+tt;Q.length=xt.length,ut=!0}}else Q[0]!==i.BACK&&(Q[0]=i.BACK,ut=!0);ut&&i.drawBuffers(Q)}function ce(F){return v!==F?(i.useProgram(F),v=F,!0):!1}let Gt={[Gn]:i.FUNC_ADD,[Ql]:i.FUNC_SUBTRACT,[tc]:i.FUNC_REVERSE_SUBTRACT};Gt[ec]=i.MIN,Gt[nc]=i.MAX;let ee={[ic]:i.ZERO,[sc]:i.ONE,[rc]:i.SRC_COLOR,[cr]:i.SRC_ALPHA,[uc]:i.SRC_ALPHA_SATURATE,[cc]:i.DST_COLOR,[ac]:i.DST_ALPHA,[oc]:i.ONE_MINUS_SRC_COLOR,[hr]:i.ONE_MINUS_SRC_ALPHA,[hc]:i.ONE_MINUS_DST_COLOR,[lc]:i.ONE_MINUS_DST_ALPHA,[dc]:i.CONSTANT_COLOR,[fc]:i.ONE_MINUS_CONSTANT_COLOR,[pc]:i.CONSTANT_ALPHA,[mc]:i.ONE_MINUS_CONSTANT_ALPHA};function Ht(F,ct,Q,ut,xt,tt,Tt,Et,pe,ae){if(F===gn){g===!0&&(Ot(i.BLEND),g=!1);return}if(g===!1&&(it(i.BLEND),g=!0),F!==jl){if(F!==p||ae!==R){if((A!==Gn||y!==Gn)&&(i.blendEquation(i.FUNC_ADD),A=Gn,y=Gn),ae)switch(F){case li:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Ea:i.blendFunc(i.ONE,i.ONE);break;case wa:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case Ta:i.blendFuncSeparate(i.DST_COLOR,i.ONE_MINUS_SRC_ALPHA,i.ZERO,i.ONE);break;default:Ft("WebGLState: Invalid blending: ",F);break}else switch(F){case li:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Ea:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE,i.ONE,i.ONE);break;case wa:Ft("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Ta:Ft("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:Ft("WebGLState: Invalid blending: ",F);break}w=null,M=null,S=null,C=null,_.set(0,0,0),E=0,p=F,R=ae}return}xt=xt||ct,tt=tt||Q,Tt=Tt||ut,(ct!==A||xt!==y)&&(i.blendEquationSeparate(Gt[ct],Gt[xt]),A=ct,y=xt),(Q!==w||ut!==M||tt!==S||Tt!==C)&&(i.blendFuncSeparate(ee[Q],ee[ut],ee[tt],ee[Tt]),w=Q,M=ut,S=tt,C=Tt),(Et.equals(_)===!1||pe!==E)&&(i.blendColor(Et.r,Et.g,Et.b,pe),_.copy(Et),E=pe),p=F,R=!1}function Yt(F,ct){F.side===Fe?Ot(i.CULL_FACE):it(i.CULL_FACE);let Q=F.side===Ae;ct&&(Q=!Q),fe(Q),F.blending===li&&F.transparent===!1?Ht(gn):Ht(F.blending,F.blendEquation,F.blendSrc,F.blendDst,F.blendEquationAlpha,F.blendSrcAlpha,F.blendDstAlpha,F.blendColor,F.blendAlpha,F.premultipliedAlpha),o.setFunc(F.depthFunc),o.setTest(F.depthTest),o.setMask(F.depthWrite),r.setMask(F.colorWrite);let ut=F.stencilWrite;a.setTest(ut),ut&&(a.setMask(F.stencilWriteMask),a.setFunc(F.stencilFunc,F.stencilRef,F.stencilFuncMask),a.setOp(F.stencilFail,F.stencilZFail,F.stencilZPass)),vt(F.polygonOffset,F.polygonOffsetFactor,F.polygonOffsetUnits),F.alphaToCoverage===!0?it(i.SAMPLE_ALPHA_TO_COVERAGE):Ot(i.SAMPLE_ALPHA_TO_COVERAGE)}function fe(F){I!==F&&(F?i.frontFace(i.CW):i.frontFace(i.CCW),I=F)}function V(F){F!==Zl?(it(i.CULL_FACE),F!==L&&(F===Sa?i.cullFace(i.BACK):F===Jl?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):Ot(i.CULL_FACE),L=F}function K(F){F!==Y&&(k&&i.lineWidth(F),Y=F)}function vt(F,ct,Q){F?(it(i.POLYGON_OFFSET_FILL),(q!==ct||O!==Q)&&(q=ct,O=Q,o.getReversed()&&(ct=-ct),i.polygonOffset(ct,Q))):Ot(i.POLYGON_OFFSET_FILL)}function yt(F){F?it(i.SCISSOR_TEST):Ot(i.SCISSOR_TEST)}function St(F){F===void 0&&(F=i.TEXTURE0+z-1),rt!==F&&(i.activeTexture(F),rt=F)}function P(F,ct,Q){Q===void 0&&(rt===null?Q=i.TEXTURE0+z-1:Q=rt);let ut=ot[Q];ut===void 0&&(ut={type:void 0,texture:void 0},ot[Q]=ut),(ut.type!==F||ut.texture!==ct)&&(rt!==Q&&(i.activeTexture(Q),rt=Q),i.bindTexture(F,ct||at[F]),ut.type=F,ut.texture=ct)}function Dt(){let F=ot[rt];F!==void 0&&F.type!==void 0&&(i.bindTexture(F.type,null),F.type=void 0,F.texture=void 0)}function gt(){try{i.compressedTexImage2D(...arguments)}catch(F){Ft("WebGLState:",F)}}function T(){try{i.compressedTexImage3D(...arguments)}catch(F){Ft("WebGLState:",F)}}function x(){try{i.texSubImage2D(...arguments)}catch(F){Ft("WebGLState:",F)}}function U(){try{i.texSubImage3D(...arguments)}catch(F){Ft("WebGLState:",F)}}function D(){try{i.compressedTexSubImage2D(...arguments)}catch(F){Ft("WebGLState:",F)}}function W(){try{i.compressedTexSubImage3D(...arguments)}catch(F){Ft("WebGLState:",F)}}function nt(){try{i.texStorage2D(...arguments)}catch(F){Ft("WebGLState:",F)}}function lt(){try{i.texStorage3D(...arguments)}catch(F){Ft("WebGLState:",F)}}function Z(){try{i.texImage2D(...arguments)}catch(F){Ft("WebGLState:",F)}}function J(){try{i.texImage3D(...arguments)}catch(F){Ft("WebGLState:",F)}}function st(F){return d[F]!==void 0?d[F]:i.getParameter(F)}function At(F,ct){d[F]!==ct&&(i.pixelStorei(F,ct),d[F]=ct)}function dt(F){te.equals(F)===!1&&(i.scissor(F.x,F.y,F.z,F.w),te.copy(F))}function ht(F){$t.equals(F)===!1&&(i.viewport(F.x,F.y,F.z,F.w),$t.copy(F))}function Pt(F,ct){let Q=c.get(ct);Q===void 0&&(Q=new WeakMap,c.set(ct,Q));let ut=Q.get(F);ut===void 0&&(ut=i.getUniformBlockIndex(ct,F.name),Q.set(F,ut))}function Ut(F,ct){let ut=c.get(ct).get(F);l.get(ct)!==ut&&(i.uniformBlockBinding(ct,ut,F.__bindingPointIndex),l.set(ct,ut))}function Wt(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.blendColor(0,0,0,0),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),o.setReversed(!1),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),i.pixelStorei(i.PACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,!1),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,i.BROWSER_DEFAULT_WEBGL),i.pixelStorei(i.PACK_ROW_LENGTH,0),i.pixelStorei(i.PACK_SKIP_PIXELS,0),i.pixelStorei(i.PACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_IMAGE_HEIGHT,0),i.pixelStorei(i.UNPACK_SKIP_PIXELS,0),i.pixelStorei(i.UNPACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_SKIP_IMAGES,0),h={},d={},rt=null,ot={},u={},f=new WeakMap,m=[],v=null,g=!1,p=null,A=null,w=null,M=null,y=null,S=null,C=null,_=new zt(0,0,0),E=0,R=!1,I=null,L=null,Y=null,q=null,O=null,te.set(0,0,i.canvas.width,i.canvas.height),$t.set(0,0,i.canvas.width,i.canvas.height),r.reset(),o.reset(),a.reset()}return{buffers:{color:r,depth:o,stencil:a},enable:it,disable:Ot,bindFramebuffer:kt,drawBuffers:Lt,useProgram:ce,setBlending:Ht,setMaterial:Yt,setFlipSided:fe,setCullFace:V,setLineWidth:K,setPolygonOffset:vt,setScissorTest:yt,activeTexture:St,bindTexture:P,unbindTexture:Dt,compressedTexImage2D:gt,compressedTexImage3D:T,texImage2D:Z,texImage3D:J,pixelStorei:At,getParameter:st,updateUBOMapping:Pt,uniformBlockBinding:Ut,texStorage2D:nt,texStorage3D:lt,texSubImage2D:x,texSubImage3D:U,compressedTexSubImage2D:D,compressedTexSubImage3D:W,scissor:dt,viewport:ht,reset:Wt}}function lg(i,t,e,n,s,r,o){let a=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new Jt,h=new WeakMap,d=new Set,u,f=new WeakMap,m=!1;try{m=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function v(T,x){return m?new OffscreenCanvas(T,x):cs("canvas")}function g(T,x,U){let D=1,W=gt(T);if((W.width>U||W.height>U)&&(D=U/Math.max(W.width,W.height)),D<1)if(typeof HTMLImageElement<"u"&&T instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&T instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&T instanceof ImageBitmap||typeof VideoFrame<"u"&&T instanceof VideoFrame){let nt=Math.floor(D*W.width),lt=Math.floor(D*W.height);u===void 0&&(u=v(nt,lt));let Z=x?v(nt,lt):u;return Z.width=nt,Z.height=lt,Z.getContext("2d").drawImage(T,0,0,nt,lt),Nt("WebGLRenderer: Texture has been resized from ("+W.width+"x"+W.height+") to ("+nt+"x"+lt+")."),Z}else return"data"in T&&Nt("WebGLRenderer: Image in DataTexture is too big ("+W.width+"x"+W.height+")."),T;return T}function p(T){return T.generateMipmaps}function A(T){i.generateMipmap(T)}function w(T){return T.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:T.isWebGL3DRenderTarget?i.TEXTURE_3D:T.isWebGLArrayRenderTarget||T.isCompressedArrayTexture?i.TEXTURE_2D_ARRAY:i.TEXTURE_2D}function M(T,x,U,D,W,nt=!1){if(T!==null){if(i[T]!==void 0)return i[T];Nt("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+T+"'")}let lt;D&&(lt=t.get("EXT_texture_norm16"),lt||Nt("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let Z=x;if(x===i.RED&&(U===i.FLOAT&&(Z=i.R32F),U===i.HALF_FLOAT&&(Z=i.R16F),U===i.UNSIGNED_BYTE&&(Z=i.R8),U===i.UNSIGNED_SHORT&&lt&&(Z=lt.R16_EXT),U===i.SHORT&&lt&&(Z=lt.R16_SNORM_EXT)),x===i.RED_INTEGER&&(U===i.UNSIGNED_BYTE&&(Z=i.R8UI),U===i.UNSIGNED_SHORT&&(Z=i.R16UI),U===i.UNSIGNED_INT&&(Z=i.R32UI),U===i.BYTE&&(Z=i.R8I),U===i.SHORT&&(Z=i.R16I),U===i.INT&&(Z=i.R32I)),x===i.RG&&(U===i.FLOAT&&(Z=i.RG32F),U===i.HALF_FLOAT&&(Z=i.RG16F),U===i.UNSIGNED_BYTE&&(Z=i.RG8),U===i.UNSIGNED_SHORT&&lt&&(Z=lt.RG16_EXT),U===i.SHORT&&lt&&(Z=lt.RG16_SNORM_EXT)),x===i.RG_INTEGER&&(U===i.UNSIGNED_BYTE&&(Z=i.RG8UI),U===i.UNSIGNED_SHORT&&(Z=i.RG16UI),U===i.UNSIGNED_INT&&(Z=i.RG32UI),U===i.BYTE&&(Z=i.RG8I),U===i.SHORT&&(Z=i.RG16I),U===i.INT&&(Z=i.RG32I)),x===i.RGB_INTEGER&&(U===i.UNSIGNED_BYTE&&(Z=i.RGB8UI),U===i.UNSIGNED_SHORT&&(Z=i.RGB16UI),U===i.UNSIGNED_INT&&(Z=i.RGB32UI),U===i.BYTE&&(Z=i.RGB8I),U===i.SHORT&&(Z=i.RGB16I),U===i.INT&&(Z=i.RGB32I)),x===i.RGBA_INTEGER&&(U===i.UNSIGNED_BYTE&&(Z=i.RGBA8UI),U===i.UNSIGNED_SHORT&&(Z=i.RGBA16UI),U===i.UNSIGNED_INT&&(Z=i.RGBA32UI),U===i.BYTE&&(Z=i.RGBA8I),U===i.SHORT&&(Z=i.RGBA16I),U===i.INT&&(Z=i.RGBA32I)),x===i.RGB&&(U===i.UNSIGNED_SHORT&&lt&&(Z=lt.RGB16_EXT),U===i.SHORT&&lt&&(Z=lt.RGB16_SNORM_EXT),U===i.UNSIGNED_INT_5_9_9_9_REV&&(Z=i.RGB9_E5),U===i.UNSIGNED_INT_10F_11F_11F_REV&&(Z=i.R11F_G11F_B10F)),x===i.RGBA){let J=nt?ls:Kt.getTransfer(W);U===i.FLOAT&&(Z=i.RGBA32F),U===i.HALF_FLOAT&&(Z=i.RGBA16F),U===i.UNSIGNED_BYTE&&(Z=J===ne?i.SRGB8_ALPHA8:i.RGBA8),U===i.UNSIGNED_SHORT&&lt&&(Z=lt.RGBA16_EXT),U===i.SHORT&&lt&&(Z=lt.RGBA16_SNORM_EXT),U===i.UNSIGNED_SHORT_4_4_4_4&&(Z=i.RGBA4),U===i.UNSIGNED_SHORT_5_5_5_1&&(Z=i.RGB5_A1)}return(Z===i.R16F||Z===i.R32F||Z===i.RG16F||Z===i.RG32F||Z===i.RGBA16F||Z===i.RGBA32F)&&t.get("EXT_color_buffer_float"),Z}function y(T,x){let U;return T?x===null||x===rn||x===Zi?U=i.DEPTH24_STENCIL8:x===on?U=i.DEPTH32F_STENCIL8:x===$i&&(U=i.DEPTH24_STENCIL8,Nt("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):x===null||x===rn||x===Zi?U=i.DEPTH_COMPONENT24:x===on?U=i.DEPTH_COMPONENT32F:x===$i&&(U=i.DEPTH_COMPONENT16),U}function S(T,x){return p(T)===!0||T.isFramebufferTexture&&T.minFilter!==we&&T.minFilter!==Te?Math.log2(Math.max(x.width,x.height))+1:T.mipmaps!==void 0&&T.mipmaps.length>0?T.mipmaps.length:T.isCompressedTexture&&Array.isArray(T.image)?x.mipmaps.length:1}function C(T){let x=T.target;x.removeEventListener("dispose",C),E(x),x.isVideoTexture&&h.delete(x),x.isHTMLTexture&&d.delete(x)}function _(T){let x=T.target;x.removeEventListener("dispose",_),I(x)}function E(T){let x=n.get(T);if(x.__webglInit===void 0)return;let U=T.source,D=f.get(U);if(D){let W=D[x.__cacheKey];W.usedTimes--,W.usedTimes===0&&R(T),Object.keys(D).length===0&&f.delete(U)}n.remove(T)}function R(T){let x=n.get(T);i.deleteTexture(x.__webglTexture);let U=T.source,D=f.get(U);delete D[x.__cacheKey],o.memory.textures--}function I(T){let x=n.get(T);if(T.depthTexture&&(T.depthTexture.dispose(),n.remove(T.depthTexture)),T.isWebGLCubeRenderTarget)for(let D=0;D<6;D++){if(Array.isArray(x.__webglFramebuffer[D]))for(let W=0;W<x.__webglFramebuffer[D].length;W++)i.deleteFramebuffer(x.__webglFramebuffer[D][W]);else i.deleteFramebuffer(x.__webglFramebuffer[D]);x.__webglDepthbuffer&&i.deleteRenderbuffer(x.__webglDepthbuffer[D])}else{if(Array.isArray(x.__webglFramebuffer))for(let D=0;D<x.__webglFramebuffer.length;D++)i.deleteFramebuffer(x.__webglFramebuffer[D]);else i.deleteFramebuffer(x.__webglFramebuffer);if(x.__webglDepthbuffer&&i.deleteRenderbuffer(x.__webglDepthbuffer),x.__webglMultisampledFramebuffer&&i.deleteFramebuffer(x.__webglMultisampledFramebuffer),x.__webglColorRenderbuffer)for(let D=0;D<x.__webglColorRenderbuffer.length;D++)x.__webglColorRenderbuffer[D]&&i.deleteRenderbuffer(x.__webglColorRenderbuffer[D]);x.__webglDepthRenderbuffer&&i.deleteRenderbuffer(x.__webglDepthRenderbuffer)}let U=T.textures;for(let D=0,W=U.length;D<W;D++){let nt=n.get(U[D]);nt.__webglTexture&&(i.deleteTexture(nt.__webglTexture),o.memory.textures--),n.remove(U[D])}n.remove(T)}let L=0;function Y(){L=0}function q(){return L}function O(T){L=T}function z(){let T=L;return T>=s.maxTextures&&Nt("WebGLTextures: Trying to use "+T+" texture units while this GPU supports only "+s.maxTextures),L+=1,T}function k(T){let x=[];return x.push(T.wrapS),x.push(T.wrapT),x.push(T.wrapR||0),x.push(T.magFilter),x.push(T.minFilter),x.push(T.anisotropy),x.push(T.internalFormat),x.push(T.format),x.push(T.type),x.push(T.generateMipmaps),x.push(T.premultiplyAlpha),x.push(T.flipY),x.push(T.unpackAlignment),x.push(T.colorSpace),x.join()}function $(T,x){let U=n.get(T);if(T.isVideoTexture&&P(T),T.isRenderTargetTexture===!1&&T.isExternalTexture!==!0&&T.version>0&&U.__version!==T.version){let D=T.image;if(D===null)Nt("WebGLRenderer: Texture marked for update but no image data found.");else if(D.complete===!1)Nt("WebGLRenderer: Texture marked for update but image is incomplete");else{Ot(U,T,x);return}}else T.isExternalTexture&&(U.__webglTexture=T.sourceTexture?T.sourceTexture:null);e.bindTexture(i.TEXTURE_2D,U.__webglTexture,i.TEXTURE0+x)}function et(T,x){let U=n.get(T);if(T.isRenderTargetTexture===!1&&T.version>0&&U.__version!==T.version){Ot(U,T,x);return}else T.isExternalTexture&&(U.__webglTexture=T.sourceTexture?T.sourceTexture:null);e.bindTexture(i.TEXTURE_2D_ARRAY,U.__webglTexture,i.TEXTURE0+x)}function rt(T,x){let U=n.get(T);if(T.isRenderTargetTexture===!1&&T.version>0&&U.__version!==T.version){Ot(U,T,x);return}e.bindTexture(i.TEXTURE_3D,U.__webglTexture,i.TEXTURE0+x)}function ot(T,x){let U=n.get(T);if(T.isCubeDepthTexture!==!0&&T.version>0&&U.__version!==T.version){kt(U,T,x);return}e.bindTexture(i.TEXTURE_CUBE_MAP,U.__webglTexture,i.TEXTURE0+x)}let _t={[_r]:i.REPEAT,[dn]:i.CLAMP_TO_EDGE,[vr]:i.MIRRORED_REPEAT},Vt={[we]:i.NEAREST,[_c]:i.NEAREST_MIPMAP_NEAREST,[Ts]:i.NEAREST_MIPMAP_LINEAR,[Te]:i.LINEAR,[Gr]:i.LINEAR_MIPMAP_NEAREST,[Jn]:i.LINEAR_MIPMAP_LINEAR},te={[bc]:i.NEVER,[Tc]:i.ALWAYS,[Mc]:i.LESS,[Co]:i.LEQUAL,[Sc]:i.EQUAL,[Ro]:i.GEQUAL,[Ec]:i.GREATER,[wc]:i.NOTEQUAL};function $t(T,x){if(x.type===on&&t.has("OES_texture_float_linear")===!1&&(x.magFilter===Te||x.magFilter===Gr||x.magFilter===Ts||x.magFilter===Jn||x.minFilter===Te||x.minFilter===Gr||x.minFilter===Ts||x.minFilter===Jn)&&Nt("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),i.texParameteri(T,i.TEXTURE_WRAP_S,_t[x.wrapS]),i.texParameteri(T,i.TEXTURE_WRAP_T,_t[x.wrapT]),(T===i.TEXTURE_3D||T===i.TEXTURE_2D_ARRAY)&&i.texParameteri(T,i.TEXTURE_WRAP_R,_t[x.wrapR]),i.texParameteri(T,i.TEXTURE_MAG_FILTER,Vt[x.magFilter]),i.texParameteri(T,i.TEXTURE_MIN_FILTER,Vt[x.minFilter]),x.compareFunction&&(i.texParameteri(T,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(T,i.TEXTURE_COMPARE_FUNC,te[x.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(x.magFilter===we||x.minFilter!==Ts&&x.minFilter!==Jn||x.type===on&&t.has("OES_texture_float_linear")===!1)return;if(x.anisotropy>1||n.get(x).__currentAnisotropy){let U=t.get("EXT_texture_filter_anisotropic");i.texParameterf(T,U.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(x.anisotropy,s.getMaxAnisotropy())),n.get(x).__currentAnisotropy=x.anisotropy}}}function j(T,x){let U=!1;T.__webglInit===void 0&&(T.__webglInit=!0,x.addEventListener("dispose",C));let D=x.source,W=f.get(D);W===void 0&&(W={},f.set(D,W));let nt=k(x);if(nt!==T.__cacheKey){W[nt]===void 0&&(W[nt]={texture:i.createTexture(),usedTimes:0},o.memory.textures++,U=!0),W[nt].usedTimes++;let lt=W[T.__cacheKey];lt!==void 0&&(W[T.__cacheKey].usedTimes--,lt.usedTimes===0&&R(x)),T.__cacheKey=nt,T.__webglTexture=W[nt].texture}return U}function at(T,x,U){return Math.floor(Math.floor(T/U)/x)}function it(T,x,U,D){let nt=T.updateRanges;if(nt.length===0)e.texSubImage2D(i.TEXTURE_2D,0,0,0,x.width,x.height,U,D,x.data);else{nt.sort((At,dt)=>At.start-dt.start);let lt=0;for(let At=1;At<nt.length;At++){let dt=nt[lt],ht=nt[At],Pt=dt.start+dt.count,Ut=at(ht.start,x.width,4),Wt=at(dt.start,x.width,4);ht.start<=Pt+1&&Ut===Wt&&at(ht.start+ht.count-1,x.width,4)===Ut?dt.count=Math.max(dt.count,ht.start+ht.count-dt.start):(++lt,nt[lt]=ht)}nt.length=lt+1;let Z=e.getParameter(i.UNPACK_ROW_LENGTH),J=e.getParameter(i.UNPACK_SKIP_PIXELS),st=e.getParameter(i.UNPACK_SKIP_ROWS);e.pixelStorei(i.UNPACK_ROW_LENGTH,x.width);for(let At=0,dt=nt.length;At<dt;At++){let ht=nt[At],Pt=Math.floor(ht.start/4),Ut=Math.ceil(ht.count/4),Wt=Pt%x.width,F=Math.floor(Pt/x.width),ct=Ut,Q=1;e.pixelStorei(i.UNPACK_SKIP_PIXELS,Wt),e.pixelStorei(i.UNPACK_SKIP_ROWS,F),e.texSubImage2D(i.TEXTURE_2D,0,Wt,F,ct,Q,U,D,x.data)}T.clearUpdateRanges(),e.pixelStorei(i.UNPACK_ROW_LENGTH,Z),e.pixelStorei(i.UNPACK_SKIP_PIXELS,J),e.pixelStorei(i.UNPACK_SKIP_ROWS,st)}}function Ot(T,x,U){let D=i.TEXTURE_2D;(x.isDataArrayTexture||x.isCompressedArrayTexture)&&(D=i.TEXTURE_2D_ARRAY),x.isData3DTexture&&(D=i.TEXTURE_3D);let W=j(T,x),nt=x.source;e.bindTexture(D,T.__webglTexture,i.TEXTURE0+U);let lt=n.get(nt);if(nt.version!==lt.__version||W===!0){if(e.activeTexture(i.TEXTURE0+U),(typeof ImageBitmap<"u"&&x.image instanceof ImageBitmap)===!1){let Q=Kt.getPrimaries(Kt.workingColorSpace),ut=x.colorSpace===In?null:Kt.getPrimaries(x.colorSpace),xt=x.colorSpace===In||Q===ut?i.NONE:i.BROWSER_DEFAULT_WEBGL;e.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,x.flipY),e.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),e.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,xt)}e.pixelStorei(i.UNPACK_ALIGNMENT,x.unpackAlignment);let J=g(x.image,!1,s.maxTextureSize);J=Dt(x,J);let st=r.convert(x.format,x.colorSpace),At=r.convert(x.type),dt=M(x.internalFormat,st,At,x.normalized,x.colorSpace,x.isVideoTexture);$t(D,x);let ht,Pt=x.mipmaps,Ut=x.isVideoTexture!==!0,Wt=lt.__version===void 0||W===!0,F=nt.dataReady,ct=S(x,J);if(x.isDepthTexture)dt=y(x.format===Kn,x.type),Wt&&(Ut?e.texStorage2D(i.TEXTURE_2D,1,dt,J.width,J.height):e.texImage2D(i.TEXTURE_2D,0,dt,J.width,J.height,0,st,At,null));else if(x.isDataTexture)if(Pt.length>0){Ut&&Wt&&e.texStorage2D(i.TEXTURE_2D,ct,dt,Pt[0].width,Pt[0].height);for(let Q=0,ut=Pt.length;Q<ut;Q++)ht=Pt[Q],Ut?F&&e.texSubImage2D(i.TEXTURE_2D,Q,0,0,ht.width,ht.height,st,At,ht.data):e.texImage2D(i.TEXTURE_2D,Q,dt,ht.width,ht.height,0,st,At,ht.data);x.generateMipmaps=!1}else Ut?(Wt&&e.texStorage2D(i.TEXTURE_2D,ct,dt,J.width,J.height),F&&it(x,J,st,At)):e.texImage2D(i.TEXTURE_2D,0,dt,J.width,J.height,0,st,At,J.data);else if(x.isCompressedTexture)if(x.isCompressedArrayTexture){Ut&&Wt&&e.texStorage3D(i.TEXTURE_2D_ARRAY,ct,dt,Pt[0].width,Pt[0].height,J.depth);for(let Q=0,ut=Pt.length;Q<ut;Q++)if(ht=Pt[Q],x.format!==Ke)if(st!==null)if(Ut){if(F)if(x.layerUpdates.size>0){let xt=Ja(ht.width,ht.height,x.format,x.type);for(let tt of x.layerUpdates){let Tt=ht.data.subarray(tt*xt/ht.data.BYTES_PER_ELEMENT,(tt+1)*xt/ht.data.BYTES_PER_ELEMENT);e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,Q,0,0,tt,ht.width,ht.height,1,st,Tt)}x.clearLayerUpdates()}else e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,Q,0,0,0,ht.width,ht.height,J.depth,st,ht.data)}else e.compressedTexImage3D(i.TEXTURE_2D_ARRAY,Q,dt,ht.width,ht.height,J.depth,0,ht.data,0,0);else Nt("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else Ut?F&&e.texSubImage3D(i.TEXTURE_2D_ARRAY,Q,0,0,0,ht.width,ht.height,J.depth,st,At,ht.data):e.texImage3D(i.TEXTURE_2D_ARRAY,Q,dt,ht.width,ht.height,J.depth,0,st,At,ht.data)}else{Ut&&Wt&&e.texStorage2D(i.TEXTURE_2D,ct,dt,Pt[0].width,Pt[0].height);for(let Q=0,ut=Pt.length;Q<ut;Q++)ht=Pt[Q],x.format!==Ke?st!==null?Ut?F&&e.compressedTexSubImage2D(i.TEXTURE_2D,Q,0,0,ht.width,ht.height,st,ht.data):e.compressedTexImage2D(i.TEXTURE_2D,Q,dt,ht.width,ht.height,0,ht.data):Nt("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Ut?F&&e.texSubImage2D(i.TEXTURE_2D,Q,0,0,ht.width,ht.height,st,At,ht.data):e.texImage2D(i.TEXTURE_2D,Q,dt,ht.width,ht.height,0,st,At,ht.data)}else if(x.isDataArrayTexture)if(Ut){if(Wt&&e.texStorage3D(i.TEXTURE_2D_ARRAY,ct,dt,J.width,J.height,J.depth),F)if(x.layerUpdates.size>0){let Q=Ja(J.width,J.height,x.format,x.type);for(let ut of x.layerUpdates){let xt=J.data.subarray(ut*Q/J.data.BYTES_PER_ELEMENT,(ut+1)*Q/J.data.BYTES_PER_ELEMENT);e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,ut,J.width,J.height,1,st,At,xt)}x.clearLayerUpdates()}else e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,J.width,J.height,J.depth,st,At,J.data)}else e.texImage3D(i.TEXTURE_2D_ARRAY,0,dt,J.width,J.height,J.depth,0,st,At,J.data);else if(x.isData3DTexture)Ut?(Wt&&e.texStorage3D(i.TEXTURE_3D,ct,dt,J.width,J.height,J.depth),F&&e.texSubImage3D(i.TEXTURE_3D,0,0,0,0,J.width,J.height,J.depth,st,At,J.data)):e.texImage3D(i.TEXTURE_3D,0,dt,J.width,J.height,J.depth,0,st,At,J.data);else if(x.isFramebufferTexture){if(Wt)if(Ut)e.texStorage2D(i.TEXTURE_2D,ct,dt,J.width,J.height);else{let Q=J.width,ut=J.height;for(let xt=0;xt<ct;xt++)e.texImage2D(i.TEXTURE_2D,xt,dt,Q,ut,0,st,At,null),Q>>=1,ut>>=1}}else if(x.isHTMLTexture){if("texElementImage2D"in i){let Q=i.canvas;if(Q.hasAttribute("layoutsubtree")||Q.setAttribute("layoutsubtree","true"),J.parentNode!==Q){Q.appendChild(J),d.add(x),Q.onpaint=ut=>{let xt=ut.changedElements;for(let tt of d)xt.includes(tt.image)&&(tt.needsUpdate=!0)},Q.requestPaint();return}if(i.texElementImage2D.length===3)i.texElementImage2D(i.TEXTURE_2D,i.RGBA8,J);else{let xt=i.RGBA,tt=i.RGBA,Tt=i.UNSIGNED_BYTE;i.texElementImage2D(i.TEXTURE_2D,0,xt,tt,Tt,J)}i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE)}}else if(Pt.length>0){if(Ut&&Wt){let Q=gt(Pt[0]);e.texStorage2D(i.TEXTURE_2D,ct,dt,Q.width,Q.height)}for(let Q=0,ut=Pt.length;Q<ut;Q++)ht=Pt[Q],Ut?F&&e.texSubImage2D(i.TEXTURE_2D,Q,0,0,st,At,ht):e.texImage2D(i.TEXTURE_2D,Q,dt,st,At,ht);x.generateMipmaps=!1}else if(Ut){if(Wt){let Q=gt(J);e.texStorage2D(i.TEXTURE_2D,ct,dt,Q.width,Q.height)}F&&e.texSubImage2D(i.TEXTURE_2D,0,0,0,st,At,J)}else e.texImage2D(i.TEXTURE_2D,0,dt,st,At,J);p(x)&&A(D),lt.__version=nt.version,x.onUpdate&&x.onUpdate(x)}T.__version=x.version}function kt(T,x,U){if(x.image.length!==6)return;let D=j(T,x),W=x.source;e.bindTexture(i.TEXTURE_CUBE_MAP,T.__webglTexture,i.TEXTURE0+U);let nt=n.get(W);if(W.version!==nt.__version||D===!0){e.activeTexture(i.TEXTURE0+U);let lt=Kt.getPrimaries(Kt.workingColorSpace),Z=x.colorSpace===In?null:Kt.getPrimaries(x.colorSpace),J=x.colorSpace===In||lt===Z?i.NONE:i.BROWSER_DEFAULT_WEBGL;e.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,x.flipY),e.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),e.pixelStorei(i.UNPACK_ALIGNMENT,x.unpackAlignment),e.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,J);let st=x.isCompressedTexture||x.image[0].isCompressedTexture,At=x.image[0]&&x.image[0].isDataTexture,dt=[];for(let tt=0;tt<6;tt++)!st&&!At?dt[tt]=g(x.image[tt],!0,s.maxCubemapSize):dt[tt]=At?x.image[tt].image:x.image[tt],dt[tt]=Dt(x,dt[tt]);let ht=dt[0],Pt=r.convert(x.format,x.colorSpace),Ut=r.convert(x.type),Wt=M(x.internalFormat,Pt,Ut,x.normalized,x.colorSpace),F=x.isVideoTexture!==!0,ct=nt.__version===void 0||D===!0,Q=W.dataReady,ut=S(x,ht);$t(i.TEXTURE_CUBE_MAP,x);let xt;if(st){F&&ct&&e.texStorage2D(i.TEXTURE_CUBE_MAP,ut,Wt,ht.width,ht.height);for(let tt=0;tt<6;tt++){xt=dt[tt].mipmaps;for(let Tt=0;Tt<xt.length;Tt++){let Et=xt[Tt];x.format!==Ke?Pt!==null?F?Q&&e.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+tt,Tt,0,0,Et.width,Et.height,Pt,Et.data):e.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+tt,Tt,Wt,Et.width,Et.height,0,Et.data):Nt("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):F?Q&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+tt,Tt,0,0,Et.width,Et.height,Pt,Ut,Et.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+tt,Tt,Wt,Et.width,Et.height,0,Pt,Ut,Et.data)}}}else{if(xt=x.mipmaps,F&&ct){xt.length>0&&ut++;let tt=gt(dt[0]);e.texStorage2D(i.TEXTURE_CUBE_MAP,ut,Wt,tt.width,tt.height)}for(let tt=0;tt<6;tt++)if(At){F?Q&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+tt,0,0,0,dt[tt].width,dt[tt].height,Pt,Ut,dt[tt].data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+tt,0,Wt,dt[tt].width,dt[tt].height,0,Pt,Ut,dt[tt].data);for(let Tt=0;Tt<xt.length;Tt++){let pe=xt[Tt].image[tt].image;F?Q&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+tt,Tt+1,0,0,pe.width,pe.height,Pt,Ut,pe.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+tt,Tt+1,Wt,pe.width,pe.height,0,Pt,Ut,pe.data)}}else{F?Q&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+tt,0,0,0,Pt,Ut,dt[tt]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+tt,0,Wt,Pt,Ut,dt[tt]);for(let Tt=0;Tt<xt.length;Tt++){let Et=xt[Tt];F?Q&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+tt,Tt+1,0,0,Pt,Ut,Et.image[tt]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+tt,Tt+1,Wt,Pt,Ut,Et.image[tt])}}}p(x)&&A(i.TEXTURE_CUBE_MAP),nt.__version=W.version,x.onUpdate&&x.onUpdate(x)}T.__version=x.version}function Lt(T,x,U,D,W,nt){let lt=r.convert(U.format,U.colorSpace),Z=r.convert(U.type),J=M(U.internalFormat,lt,Z,U.normalized,U.colorSpace),st=n.get(x),At=n.get(U);if(At.__renderTarget=x,!st.__hasExternalTextures){let dt=Math.max(1,x.width>>nt),ht=Math.max(1,x.height>>nt);W===i.TEXTURE_3D||W===i.TEXTURE_2D_ARRAY?e.texImage3D(W,nt,J,dt,ht,x.depth,0,lt,Z,null):e.texImage2D(W,nt,J,dt,ht,0,lt,Z,null)}e.bindFramebuffer(i.FRAMEBUFFER,T),St(x)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,D,W,At.__webglTexture,0,yt(x)):(W===i.TEXTURE_2D||W>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&W<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,D,W,At.__webglTexture,nt),e.bindFramebuffer(i.FRAMEBUFFER,null)}function ce(T,x,U){if(i.bindRenderbuffer(i.RENDERBUFFER,T),x.depthBuffer){let D=x.depthTexture,W=D&&D.isDepthTexture?D.type:null,nt=y(x.stencilBuffer,W),lt=x.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;St(x)?a.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,yt(x),nt,x.width,x.height):U?i.renderbufferStorageMultisample(i.RENDERBUFFER,yt(x),nt,x.width,x.height):i.renderbufferStorage(i.RENDERBUFFER,nt,x.width,x.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,lt,i.RENDERBUFFER,T)}else{let D=x.textures;for(let W=0;W<D.length;W++){let nt=D[W],lt=r.convert(nt.format,nt.colorSpace),Z=r.convert(nt.type),J=M(nt.internalFormat,lt,Z,nt.normalized,nt.colorSpace);St(x)?a.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,yt(x),J,x.width,x.height):U?i.renderbufferStorageMultisample(i.RENDERBUFFER,yt(x),J,x.width,x.height):i.renderbufferStorage(i.RENDERBUFFER,J,x.width,x.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function Gt(T,x,U){let D=x.isWebGLCubeRenderTarget===!0;if(e.bindFramebuffer(i.FRAMEBUFFER,T),!(x.depthTexture&&x.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");let W=n.get(x.depthTexture);if(W.__renderTarget=x,(!W.__webglTexture||x.depthTexture.image.width!==x.width||x.depthTexture.image.height!==x.height)&&(x.depthTexture.image.width=x.width,x.depthTexture.image.height=x.height,x.depthTexture.needsUpdate=!0),D){if(W.__webglInit===void 0&&(W.__webglInit=!0,x.depthTexture.addEventListener("dispose",C)),W.__webglTexture===void 0){W.__webglTexture=i.createTexture(),e.bindTexture(i.TEXTURE_CUBE_MAP,W.__webglTexture),$t(i.TEXTURE_CUBE_MAP,x.depthTexture);let st=r.convert(x.depthTexture.format),At=r.convert(x.depthTexture.type),dt;x.depthTexture.format===fn?dt=i.DEPTH_COMPONENT24:x.depthTexture.format===Kn&&(dt=i.DEPTH24_STENCIL8);for(let ht=0;ht<6;ht++)i.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ht,0,dt,x.width,x.height,0,st,At,null)}}else $(x.depthTexture,0);let nt=W.__webglTexture,lt=yt(x),Z=D?i.TEXTURE_CUBE_MAP_POSITIVE_X+U:i.TEXTURE_2D,J=x.depthTexture.format===Kn?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;if(x.depthTexture.format===fn)St(x)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,J,Z,nt,0,lt):i.framebufferTexture2D(i.FRAMEBUFFER,J,Z,nt,0);else if(x.depthTexture.format===Kn)St(x)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,J,Z,nt,0,lt):i.framebufferTexture2D(i.FRAMEBUFFER,J,Z,nt,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function ee(T){let x=n.get(T),U=T.isWebGLCubeRenderTarget===!0;if(x.__boundDepthTexture!==T.depthTexture){let D=T.depthTexture;if(x.__depthDisposeCallback&&x.__depthDisposeCallback(),D){let W=()=>{delete x.__boundDepthTexture,delete x.__depthDisposeCallback,D.removeEventListener("dispose",W)};D.addEventListener("dispose",W),x.__depthDisposeCallback=W}x.__boundDepthTexture=D}if(T.depthTexture&&!x.__autoAllocateDepthBuffer)if(U)for(let D=0;D<6;D++)Gt(x.__webglFramebuffer[D],T,D);else{let D=T.texture.mipmaps;D&&D.length>0?Gt(x.__webglFramebuffer[0],T,0):Gt(x.__webglFramebuffer,T,0)}else if(U){x.__webglDepthbuffer=[];for(let D=0;D<6;D++)if(e.bindFramebuffer(i.FRAMEBUFFER,x.__webglFramebuffer[D]),x.__webglDepthbuffer[D]===void 0)x.__webglDepthbuffer[D]=i.createRenderbuffer(),ce(x.__webglDepthbuffer[D],T,!1);else{let W=T.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,nt=x.__webglDepthbuffer[D];i.bindRenderbuffer(i.RENDERBUFFER,nt),i.framebufferRenderbuffer(i.FRAMEBUFFER,W,i.RENDERBUFFER,nt)}}else{let D=T.texture.mipmaps;if(D&&D.length>0?e.bindFramebuffer(i.FRAMEBUFFER,x.__webglFramebuffer[0]):e.bindFramebuffer(i.FRAMEBUFFER,x.__webglFramebuffer),x.__webglDepthbuffer===void 0)x.__webglDepthbuffer=i.createRenderbuffer(),ce(x.__webglDepthbuffer,T,!1);else{let W=T.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,nt=x.__webglDepthbuffer;i.bindRenderbuffer(i.RENDERBUFFER,nt),i.framebufferRenderbuffer(i.FRAMEBUFFER,W,i.RENDERBUFFER,nt)}}e.bindFramebuffer(i.FRAMEBUFFER,null)}function Ht(T,x,U){let D=n.get(T);x!==void 0&&Lt(D.__webglFramebuffer,T,T.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),U!==void 0&&ee(T)}function Yt(T){let x=T.texture,U=n.get(T),D=n.get(x);T.addEventListener("dispose",_);let W=T.textures,nt=T.isWebGLCubeRenderTarget===!0,lt=W.length>1;if(lt||(D.__webglTexture===void 0&&(D.__webglTexture=i.createTexture()),D.__version=x.version,o.memory.textures++),nt){U.__webglFramebuffer=[];for(let Z=0;Z<6;Z++)if(x.mipmaps&&x.mipmaps.length>0){U.__webglFramebuffer[Z]=[];for(let J=0;J<x.mipmaps.length;J++)U.__webglFramebuffer[Z][J]=i.createFramebuffer()}else U.__webglFramebuffer[Z]=i.createFramebuffer()}else{if(x.mipmaps&&x.mipmaps.length>0){U.__webglFramebuffer=[];for(let Z=0;Z<x.mipmaps.length;Z++)U.__webglFramebuffer[Z]=i.createFramebuffer()}else U.__webglFramebuffer=i.createFramebuffer();if(lt)for(let Z=0,J=W.length;Z<J;Z++){let st=n.get(W[Z]);st.__webglTexture===void 0&&(st.__webglTexture=i.createTexture(),o.memory.textures++)}if(T.samples>0&&St(T)===!1){U.__webglMultisampledFramebuffer=i.createFramebuffer(),U.__webglColorRenderbuffer=[],e.bindFramebuffer(i.FRAMEBUFFER,U.__webglMultisampledFramebuffer);for(let Z=0;Z<W.length;Z++){let J=W[Z];U.__webglColorRenderbuffer[Z]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,U.__webglColorRenderbuffer[Z]);let st=r.convert(J.format,J.colorSpace),At=r.convert(J.type),dt=M(J.internalFormat,st,At,J.normalized,J.colorSpace,T.isXRRenderTarget===!0),ht=yt(T);i.renderbufferStorageMultisample(i.RENDERBUFFER,ht,dt,T.width,T.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+Z,i.RENDERBUFFER,U.__webglColorRenderbuffer[Z])}i.bindRenderbuffer(i.RENDERBUFFER,null),T.depthBuffer&&(U.__webglDepthRenderbuffer=i.createRenderbuffer(),ce(U.__webglDepthRenderbuffer,T,!0)),e.bindFramebuffer(i.FRAMEBUFFER,null)}}if(nt){e.bindTexture(i.TEXTURE_CUBE_MAP,D.__webglTexture),$t(i.TEXTURE_CUBE_MAP,x);for(let Z=0;Z<6;Z++)if(x.mipmaps&&x.mipmaps.length>0)for(let J=0;J<x.mipmaps.length;J++)Lt(U.__webglFramebuffer[Z][J],T,x,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,J);else Lt(U.__webglFramebuffer[Z],T,x,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,0);p(x)&&A(i.TEXTURE_CUBE_MAP),e.unbindTexture()}else if(lt){for(let Z=0,J=W.length;Z<J;Z++){let st=W[Z],At=n.get(st),dt=i.TEXTURE_2D;(T.isWebGL3DRenderTarget||T.isWebGLArrayRenderTarget)&&(dt=T.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture(dt,At.__webglTexture),$t(dt,st),Lt(U.__webglFramebuffer,T,st,i.COLOR_ATTACHMENT0+Z,dt,0),p(st)&&A(dt)}e.unbindTexture()}else{let Z=i.TEXTURE_2D;if((T.isWebGL3DRenderTarget||T.isWebGLArrayRenderTarget)&&(Z=T.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture(Z,D.__webglTexture),$t(Z,x),x.mipmaps&&x.mipmaps.length>0)for(let J=0;J<x.mipmaps.length;J++)Lt(U.__webglFramebuffer[J],T,x,i.COLOR_ATTACHMENT0,Z,J);else Lt(U.__webglFramebuffer,T,x,i.COLOR_ATTACHMENT0,Z,0);p(x)&&A(Z),e.unbindTexture()}T.depthBuffer&&ee(T)}function fe(T){let x=T.textures;for(let U=0,D=x.length;U<D;U++){let W=x[U];if(p(W)){let nt=w(T),lt=n.get(W).__webglTexture;e.bindTexture(nt,lt),A(nt),e.unbindTexture()}}}let V=[],K=[];function vt(T){if(T.samples>0){if(St(T)===!1){let x=T.textures,U=T.width,D=T.height,W=i.COLOR_BUFFER_BIT,nt=T.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,lt=n.get(T),Z=x.length>1;if(Z)for(let st=0;st<x.length;st++)e.bindFramebuffer(i.FRAMEBUFFER,lt.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+st,i.RENDERBUFFER,null),e.bindFramebuffer(i.FRAMEBUFFER,lt.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+st,i.TEXTURE_2D,null,0);e.bindFramebuffer(i.READ_FRAMEBUFFER,lt.__webglMultisampledFramebuffer);let J=T.texture.mipmaps;J&&J.length>0?e.bindFramebuffer(i.DRAW_FRAMEBUFFER,lt.__webglFramebuffer[0]):e.bindFramebuffer(i.DRAW_FRAMEBUFFER,lt.__webglFramebuffer);for(let st=0;st<x.length;st++){if(T.resolveDepthBuffer&&(T.depthBuffer&&(W|=i.DEPTH_BUFFER_BIT),T.stencilBuffer&&T.resolveStencilBuffer&&(W|=i.STENCIL_BUFFER_BIT)),Z){i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,lt.__webglColorRenderbuffer[st]);let At=n.get(x[st]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,At,0)}i.blitFramebuffer(0,0,U,D,0,0,U,D,W,i.NEAREST),l===!0&&(V.length=0,K.length=0,V.push(i.COLOR_ATTACHMENT0+st),T.depthBuffer&&T.resolveDepthBuffer===!1&&(V.push(nt),K.push(nt),i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,K)),i.invalidateFramebuffer(i.READ_FRAMEBUFFER,V))}if(e.bindFramebuffer(i.READ_FRAMEBUFFER,null),e.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),Z)for(let st=0;st<x.length;st++){e.bindFramebuffer(i.FRAMEBUFFER,lt.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+st,i.RENDERBUFFER,lt.__webglColorRenderbuffer[st]);let At=n.get(x[st]).__webglTexture;e.bindFramebuffer(i.FRAMEBUFFER,lt.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+st,i.TEXTURE_2D,At,0)}e.bindFramebuffer(i.DRAW_FRAMEBUFFER,lt.__webglMultisampledFramebuffer)}else if(T.depthBuffer&&T.resolveDepthBuffer===!1&&l){let x=T.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[x])}}}function yt(T){return Math.min(s.maxSamples,T.samples)}function St(T){let x=n.get(T);return T.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&x.__useRenderToTexture!==!1}function P(T){let x=o.render.frame;h.get(T)!==x&&(h.set(T,x),T.update())}function Dt(T,x){let U=T.colorSpace,D=T.format,W=T.type;return T.isCompressedTexture===!0||T.isVideoTexture===!0||U!==as&&U!==In&&(Kt.getTransfer(U)===ne?(D!==Ke||W!==Ve)&&Nt("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):Ft("WebGLTextures: Unsupported texture color space:",U)),x}function gt(T){return typeof HTMLImageElement<"u"&&T instanceof HTMLImageElement?(c.width=T.naturalWidth||T.width,c.height=T.naturalHeight||T.height):typeof VideoFrame<"u"&&T instanceof VideoFrame?(c.width=T.displayWidth,c.height=T.displayHeight):(c.width=T.width,c.height=T.height),c}this.allocateTextureUnit=z,this.resetTextureUnits=Y,this.getTextureUnits=q,this.setTextureUnits=O,this.setTexture2D=$,this.setTexture2DArray=et,this.setTexture3D=rt,this.setTextureCube=ot,this.rebindTextures=Ht,this.setupRenderTarget=Yt,this.updateRenderTargetMipmap=fe,this.updateMultisampleRenderTarget=vt,this.setupDepthRenderbuffer=ee,this.setupFrameBufferTexture=Lt,this.useMultisampledRTT=St,this.isReversedDepthBuffer=function(){return e.buffers.depth.getReversed()}}function cg(i,t){function e(n,s=In){let r,o=Kt.getTransfer(s);if(n===Ve)return i.UNSIGNED_BYTE;if(n===Xr)return i.UNSIGNED_SHORT_4_4_4_4;if(n===Yr)return i.UNSIGNED_SHORT_5_5_5_1;if(n===Ba)return i.UNSIGNED_INT_5_9_9_9_REV;if(n===za)return i.UNSIGNED_INT_10F_11F_11F_REV;if(n===Fa)return i.BYTE;if(n===Oa)return i.SHORT;if(n===$i)return i.UNSIGNED_SHORT;if(n===Wr)return i.INT;if(n===rn)return i.UNSIGNED_INT;if(n===on)return i.FLOAT;if(n===xn)return i.HALF_FLOAT;if(n===Va)return i.ALPHA;if(n===ka)return i.RGB;if(n===Ke)return i.RGBA;if(n===fn)return i.DEPTH_COMPONENT;if(n===Kn)return i.DEPTH_STENCIL;if(n===Ha)return i.RED;if(n===qr)return i.RED_INTEGER;if(n===jn)return i.RG;if(n===$r)return i.RG_INTEGER;if(n===Zr)return i.RGBA_INTEGER;if(n===As||n===Cs||n===Rs||n===Is)if(o===ne)if(r=t.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===As)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===Cs)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===Rs)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===Is)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=t.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===As)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Cs)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===Rs)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===Is)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===Jr||n===Kr||n===jr||n===Qr)if(r=t.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===Jr)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===Kr)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===jr)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===Qr)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===to||n===eo||n===no||n===io||n===so||n===Ps||n===ro)if(r=t.get("WEBGL_compressed_texture_etc"),r!==null){if(n===to||n===eo)return o===ne?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===no)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC;if(n===io)return r.COMPRESSED_R11_EAC;if(n===so)return r.COMPRESSED_SIGNED_R11_EAC;if(n===Ps)return r.COMPRESSED_RG11_EAC;if(n===ro)return r.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===oo||n===ao||n===lo||n===co||n===ho||n===uo||n===fo||n===po||n===mo||n===go||n===xo||n===_o||n===vo||n===yo)if(r=t.get("WEBGL_compressed_texture_astc"),r!==null){if(n===oo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===ao)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===lo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===co)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===ho)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===uo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===fo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===po)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===mo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===go)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===xo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===_o)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===vo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===yo)return o===ne?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===bo||n===Mo||n===So)if(r=t.get("EXT_texture_compression_bptc"),r!==null){if(n===bo)return o===ne?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===Mo)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===So)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===Eo||n===wo||n===Ls||n===To)if(r=t.get("EXT_texture_compression_rgtc"),r!==null){if(n===Eo)return r.COMPRESSED_RED_RGTC1_EXT;if(n===wo)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===Ls)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===To)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===Zi?i.UNSIGNED_INT_24_8:i[n]!==void 0?i[n]:null}return{convert:e}}var hg=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,ug=`
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

}`,hl=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,e){if(this.texture===null){let n=new xs(t.texture);(t.depthNear!==e.depthNear||t.depthFar!==e.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=n}}getMesh(t){if(this.texture!==null&&this.mesh===null){let e=t.cameras[0].viewport,n=new Ue({vertexShader:hg,fragmentShader:ug,uniforms:{depthColor:{value:this.texture},depthWidth:{value:e.z},depthHeight:{value:e.w}}});this.mesh=new ge(new _s(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},ul=class extends pn{constructor(t,e){super();let n=this,s=null,r=1,o=null,a="local-floor",l=1,c=null,h=null,d=null,u=null,f=null,m=null,v=typeof XRWebGLBinding<"u",g=new hl,p={},A=e.getContextAttributes(),w=null,M=null,y=[],S=[],C=new Jt,_=null,E=new Pe;E.viewport=new de;let R=new Pe;R.viewport=new de;let I=[E,R],L=new Vr,Y=null,q=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(j){let at=y[j];return at===void 0&&(at=new zi,y[j]=at),at.getTargetRaySpace()},this.getControllerGrip=function(j){let at=y[j];return at===void 0&&(at=new zi,y[j]=at),at.getGripSpace()},this.getHand=function(j){let at=y[j];return at===void 0&&(at=new zi,y[j]=at),at.getHandSpace()};function O(j){let at=S.indexOf(j.inputSource);if(at===-1)return;let it=y[at];it!==void 0&&(it.update(j.inputSource,j.frame,c||o),it.dispatchEvent({type:j.type,data:j.inputSource}))}function z(){s.removeEventListener("select",O),s.removeEventListener("selectstart",O),s.removeEventListener("selectend",O),s.removeEventListener("squeeze",O),s.removeEventListener("squeezestart",O),s.removeEventListener("squeezeend",O),s.removeEventListener("end",z),s.removeEventListener("inputsourceschange",k);for(let j=0;j<y.length;j++){let at=S[j];at!==null&&(S[j]=null,y[j].disconnect(at))}Y=null,q=null,g.reset();for(let j in p)delete p[j];t.setRenderTarget(w),f=null,u=null,d=null,s=null,M=null,$t.stop(),n.isPresenting=!1,t.setPixelRatio(_),t.setSize(C.width,C.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(j){r=j,n.isPresenting===!0&&Nt("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(j){a=j,n.isPresenting===!0&&Nt("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||o},this.setReferenceSpace=function(j){c=j},this.getBaseLayer=function(){return u!==null?u:f},this.getBinding=function(){return d===null&&v&&(d=new XRWebGLBinding(s,e)),d},this.getFrame=function(){return m},this.getSession=function(){return s},this.setSession=async function(j){if(s=j,s!==null){if(w=t.getRenderTarget(),s.addEventListener("select",O),s.addEventListener("selectstart",O),s.addEventListener("selectend",O),s.addEventListener("squeeze",O),s.addEventListener("squeezestart",O),s.addEventListener("squeezeend",O),s.addEventListener("end",z),s.addEventListener("inputsourceschange",k),A.xrCompatible!==!0&&await e.makeXRCompatible(),_=t.getPixelRatio(),t.getSize(C),v&&"createProjectionLayer"in XRWebGLBinding.prototype){let it=null,Ot=null,kt=null;A.depth&&(kt=A.stencil?e.DEPTH24_STENCIL8:e.DEPTH_COMPONENT24,it=A.stencil?Kn:fn,Ot=A.stencil?Zi:rn);let Lt={colorFormat:e.RGBA8,depthFormat:kt,scaleFactor:r};d=this.getBinding(),u=d.createProjectionLayer(Lt),s.updateRenderState({layers:[u]}),t.setPixelRatio(1),t.setSize(u.textureWidth,u.textureHeight,!1),M=new Xe(u.textureWidth,u.textureHeight,{format:Ke,type:Ve,depthTexture:new Rn(u.textureWidth,u.textureHeight,Ot,void 0,void 0,void 0,void 0,void 0,void 0,it),stencilBuffer:A.stencil,colorSpace:t.outputColorSpace,samples:A.antialias?4:0,resolveDepthBuffer:u.ignoreDepthValues===!1,resolveStencilBuffer:u.ignoreDepthValues===!1})}else{let it={antialias:A.antialias,alpha:!0,depth:A.depth,stencil:A.stencil,framebufferScaleFactor:r};f=new XRWebGLLayer(s,e,it),s.updateRenderState({baseLayer:f}),t.setPixelRatio(1),t.setSize(f.framebufferWidth,f.framebufferHeight,!1),M=new Xe(f.framebufferWidth,f.framebufferHeight,{format:Ke,type:Ve,colorSpace:t.outputColorSpace,stencilBuffer:A.stencil,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1})}M.isXRRenderTarget=!0,this.setFoveation(l),c=null,o=await s.requestReferenceSpace(a),$t.setContext(s),$t.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return g.getDepthTexture()};function k(j){for(let at=0;at<j.removed.length;at++){let it=j.removed[at],Ot=S.indexOf(it);Ot>=0&&(S[Ot]=null,y[Ot].disconnect(it))}for(let at=0;at<j.added.length;at++){let it=j.added[at],Ot=S.indexOf(it);if(Ot===-1){for(let Lt=0;Lt<y.length;Lt++)if(Lt>=S.length){S.push(it),Ot=Lt;break}else if(S[Lt]===null){S[Lt]=it,Ot=Lt;break}if(Ot===-1)break}let kt=y[Ot];kt&&kt.connect(it)}}let $=new N,et=new N;function rt(j,at,it){$.setFromMatrixPosition(at.matrixWorld),et.setFromMatrixPosition(it.matrixWorld);let Ot=$.distanceTo(et),kt=at.projectionMatrix.elements,Lt=it.projectionMatrix.elements,ce=kt[14]/(kt[10]-1),Gt=kt[14]/(kt[10]+1),ee=(kt[9]+1)/kt[5],Ht=(kt[9]-1)/kt[5],Yt=(kt[8]-1)/kt[0],fe=(Lt[8]+1)/Lt[0],V=ce*Yt,K=ce*fe,vt=Ot/(-Yt+fe),yt=vt*-Yt;if(at.matrixWorld.decompose(j.position,j.quaternion,j.scale),j.translateX(yt),j.translateZ(vt),j.matrixWorld.compose(j.position,j.quaternion,j.scale),j.matrixWorldInverse.copy(j.matrixWorld).invert(),kt[10]===-1)j.projectionMatrix.copy(at.projectionMatrix),j.projectionMatrixInverse.copy(at.projectionMatrixInverse);else{let St=ce+vt,P=Gt+vt,Dt=V-yt,gt=K+(Ot-yt),T=ee*Gt/P*St,x=Ht*Gt/P*St;j.projectionMatrix.makePerspective(Dt,gt,T,x,St,P),j.projectionMatrixInverse.copy(j.projectionMatrix).invert()}}function ot(j,at){at===null?j.matrixWorld.copy(j.matrix):j.matrixWorld.multiplyMatrices(at.matrixWorld,j.matrix),j.matrixWorldInverse.copy(j.matrixWorld).invert()}this.updateCamera=function(j){if(s===null)return;let at=j.near,it=j.far;g.texture!==null&&(g.depthNear>0&&(at=g.depthNear),g.depthFar>0&&(it=g.depthFar)),L.near=R.near=E.near=at,L.far=R.far=E.far=it,(Y!==L.near||q!==L.far)&&(s.updateRenderState({depthNear:L.near,depthFar:L.far}),Y=L.near,q=L.far),L.layers.mask=j.layers.mask|6,E.layers.mask=L.layers.mask&-5,R.layers.mask=L.layers.mask&-3;let Ot=j.parent,kt=L.cameras;ot(L,Ot);for(let Lt=0;Lt<kt.length;Lt++)ot(kt[Lt],Ot);kt.length===2?rt(L,E,R):L.projectionMatrix.copy(E.projectionMatrix),_t(j,L,Ot)};function _t(j,at,it){it===null?j.matrix.copy(at.matrixWorld):(j.matrix.copy(it.matrixWorld),j.matrix.invert(),j.matrix.multiply(at.matrixWorld)),j.matrix.decompose(j.position,j.quaternion,j.scale),j.updateMatrixWorld(!0),j.projectionMatrix.copy(at.projectionMatrix),j.projectionMatrixInverse.copy(at.projectionMatrixInverse),j.isPerspectiveCamera&&(j.fov=Fi*2*Math.atan(1/j.projectionMatrix.elements[5]),j.zoom=1)}this.getCamera=function(){return L},this.getFoveation=function(){if(!(u===null&&f===null))return l},this.setFoveation=function(j){l=j,u!==null&&(u.fixedFoveation=j),f!==null&&f.fixedFoveation!==void 0&&(f.fixedFoveation=j)},this.hasDepthSensing=function(){return g.texture!==null},this.getDepthSensingMesh=function(){return g.getMesh(L)},this.getCameraTexture=function(j){return p[j]};let Vt=null;function te(j,at){if(h=at.getViewerPose(c||o),m=at,h!==null){let it=h.views;f!==null&&(t.setRenderTargetFramebuffer(M,f.framebuffer),t.setRenderTarget(M));let Ot=!1;it.length!==L.cameras.length&&(L.cameras.length=0,Ot=!0);for(let Gt=0;Gt<it.length;Gt++){let ee=it[Gt],Ht=null;if(f!==null)Ht=f.getViewport(ee);else{let fe=d.getViewSubImage(u,ee);Ht=fe.viewport,Gt===0&&(t.setRenderTargetTextures(M,fe.colorTexture,fe.depthStencilTexture),t.setRenderTarget(M))}let Yt=I[Gt];Yt===void 0&&(Yt=new Pe,Yt.layers.enable(Gt),Yt.viewport=new de,I[Gt]=Yt),Yt.matrix.fromArray(ee.transform.matrix),Yt.matrix.decompose(Yt.position,Yt.quaternion,Yt.scale),Yt.projectionMatrix.fromArray(ee.projectionMatrix),Yt.projectionMatrixInverse.copy(Yt.projectionMatrix).invert(),Yt.viewport.set(Ht.x,Ht.y,Ht.width,Ht.height),Gt===0&&(L.matrix.copy(Yt.matrix),L.matrix.decompose(L.position,L.quaternion,L.scale)),Ot===!0&&L.cameras.push(Yt)}let kt=s.enabledFeatures;if(kt&&kt.includes("depth-sensing")&&s.depthUsage=="gpu-optimized"&&v){d=n.getBinding();let Gt=d.getDepthInformation(it[0]);Gt&&Gt.isValid&&Gt.texture&&g.init(Gt,s.renderState)}if(kt&&kt.includes("camera-access")&&v){t.state.unbindTexture(),d=n.getBinding();for(let Gt=0;Gt<it.length;Gt++){let ee=it[Gt].camera;if(ee){let Ht=p[ee];Ht||(Ht=new xs,p[ee]=Ht);let Yt=d.getCameraImage(ee);Ht.sourceTexture=Yt}}}}for(let it=0;it<y.length;it++){let Ot=S[it],kt=y[it];Ot!==null&&kt!==void 0&&kt.update(Ot,at,c||o)}Vt&&Vt(j,at),at.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:at}),m=null}let $t=new nh;$t.setAnimationLoop(te),this.setAnimationLoop=function(j){Vt=j},this.dispose=function(){}}},dg=new ue,lh=new Bt;lh.set(-1,0,0,0,1,0,0,0,1);function fg(i,t){function e(g,p){g.matrixAutoUpdate===!0&&g.updateMatrix(),p.value.copy(g.matrix)}function n(g,p){p.color.getRGB(g.fogColor.value,qa(i)),p.isFog?(g.fogNear.value=p.near,g.fogFar.value=p.far):p.isFogExp2&&(g.fogDensity.value=p.density)}function s(g,p,A,w,M){p.isNodeMaterial?p.uniformsNeedUpdate=!1:p.isMeshBasicMaterial?r(g,p):p.isMeshLambertMaterial?(r(g,p),p.envMap&&(g.envMapIntensity.value=p.envMapIntensity)):p.isMeshToonMaterial?(r(g,p),d(g,p)):p.isMeshPhongMaterial?(r(g,p),h(g,p),p.envMap&&(g.envMapIntensity.value=p.envMapIntensity)):p.isMeshStandardMaterial?(r(g,p),u(g,p),p.isMeshPhysicalMaterial&&f(g,p,M)):p.isMeshMatcapMaterial?(r(g,p),m(g,p)):p.isMeshDepthMaterial?r(g,p):p.isMeshDistanceMaterial?(r(g,p),v(g,p)):p.isMeshNormalMaterial?r(g,p):p.isLineBasicMaterial?(o(g,p),p.isLineDashedMaterial&&a(g,p)):p.isPointsMaterial?l(g,p,A,w):p.isSpriteMaterial?c(g,p):p.isShadowMaterial?(g.color.value.copy(p.color),g.opacity.value=p.opacity):p.isShaderMaterial&&(p.uniformsNeedUpdate=!1)}function r(g,p){g.opacity.value=p.opacity,p.color&&g.diffuse.value.copy(p.color),p.emissive&&g.emissive.value.copy(p.emissive).multiplyScalar(p.emissiveIntensity),p.map&&(g.map.value=p.map,e(p.map,g.mapTransform)),p.alphaMap&&(g.alphaMap.value=p.alphaMap,e(p.alphaMap,g.alphaMapTransform)),p.bumpMap&&(g.bumpMap.value=p.bumpMap,e(p.bumpMap,g.bumpMapTransform),g.bumpScale.value=p.bumpScale,p.side===Ae&&(g.bumpScale.value*=-1)),p.normalMap&&(g.normalMap.value=p.normalMap,e(p.normalMap,g.normalMapTransform),g.normalScale.value.copy(p.normalScale),p.side===Ae&&g.normalScale.value.negate()),p.displacementMap&&(g.displacementMap.value=p.displacementMap,e(p.displacementMap,g.displacementMapTransform),g.displacementScale.value=p.displacementScale,g.displacementBias.value=p.displacementBias),p.emissiveMap&&(g.emissiveMap.value=p.emissiveMap,e(p.emissiveMap,g.emissiveMapTransform)),p.specularMap&&(g.specularMap.value=p.specularMap,e(p.specularMap,g.specularMapTransform)),p.alphaTest>0&&(g.alphaTest.value=p.alphaTest);let A=t.get(p),w=A.envMap,M=A.envMapRotation;w&&(g.envMap.value=w,g.envMapRotation.value.setFromMatrix4(dg.makeRotationFromEuler(M)).transpose(),w.isCubeTexture&&w.isRenderTargetTexture===!1&&g.envMapRotation.value.premultiply(lh),g.reflectivity.value=p.reflectivity,g.ior.value=p.ior,g.refractionRatio.value=p.refractionRatio),p.lightMap&&(g.lightMap.value=p.lightMap,g.lightMapIntensity.value=p.lightMapIntensity,e(p.lightMap,g.lightMapTransform)),p.aoMap&&(g.aoMap.value=p.aoMap,g.aoMapIntensity.value=p.aoMapIntensity,e(p.aoMap,g.aoMapTransform))}function o(g,p){g.diffuse.value.copy(p.color),g.opacity.value=p.opacity,p.map&&(g.map.value=p.map,e(p.map,g.mapTransform))}function a(g,p){g.dashSize.value=p.dashSize,g.totalSize.value=p.dashSize+p.gapSize,g.scale.value=p.scale}function l(g,p,A,w){g.diffuse.value.copy(p.color),g.opacity.value=p.opacity,g.size.value=p.size*A,g.scale.value=w*.5,p.map&&(g.map.value=p.map,e(p.map,g.uvTransform)),p.alphaMap&&(g.alphaMap.value=p.alphaMap,e(p.alphaMap,g.alphaMapTransform)),p.alphaTest>0&&(g.alphaTest.value=p.alphaTest)}function c(g,p){g.diffuse.value.copy(p.color),g.opacity.value=p.opacity,g.rotation.value=p.rotation,p.map&&(g.map.value=p.map,e(p.map,g.mapTransform)),p.alphaMap&&(g.alphaMap.value=p.alphaMap,e(p.alphaMap,g.alphaMapTransform)),p.alphaTest>0&&(g.alphaTest.value=p.alphaTest)}function h(g,p){g.specular.value.copy(p.specular),g.shininess.value=Math.max(p.shininess,1e-4)}function d(g,p){p.gradientMap&&(g.gradientMap.value=p.gradientMap)}function u(g,p){g.metalness.value=p.metalness,p.metalnessMap&&(g.metalnessMap.value=p.metalnessMap,e(p.metalnessMap,g.metalnessMapTransform)),g.roughness.value=p.roughness,p.roughnessMap&&(g.roughnessMap.value=p.roughnessMap,e(p.roughnessMap,g.roughnessMapTransform)),p.envMap&&(g.envMapIntensity.value=p.envMapIntensity)}function f(g,p,A){g.ior.value=p.ior,p.sheen>0&&(g.sheenColor.value.copy(p.sheenColor).multiplyScalar(p.sheen),g.sheenRoughness.value=p.sheenRoughness,p.sheenColorMap&&(g.sheenColorMap.value=p.sheenColorMap,e(p.sheenColorMap,g.sheenColorMapTransform)),p.sheenRoughnessMap&&(g.sheenRoughnessMap.value=p.sheenRoughnessMap,e(p.sheenRoughnessMap,g.sheenRoughnessMapTransform))),p.clearcoat>0&&(g.clearcoat.value=p.clearcoat,g.clearcoatRoughness.value=p.clearcoatRoughness,p.clearcoatMap&&(g.clearcoatMap.value=p.clearcoatMap,e(p.clearcoatMap,g.clearcoatMapTransform)),p.clearcoatRoughnessMap&&(g.clearcoatRoughnessMap.value=p.clearcoatRoughnessMap,e(p.clearcoatRoughnessMap,g.clearcoatRoughnessMapTransform)),p.clearcoatNormalMap&&(g.clearcoatNormalMap.value=p.clearcoatNormalMap,e(p.clearcoatNormalMap,g.clearcoatNormalMapTransform),g.clearcoatNormalScale.value.copy(p.clearcoatNormalScale),p.side===Ae&&g.clearcoatNormalScale.value.negate())),p.dispersion>0&&(g.dispersion.value=p.dispersion),p.iridescence>0&&(g.iridescence.value=p.iridescence,g.iridescenceIOR.value=p.iridescenceIOR,g.iridescenceThicknessMinimum.value=p.iridescenceThicknessRange[0],g.iridescenceThicknessMaximum.value=p.iridescenceThicknessRange[1],p.iridescenceMap&&(g.iridescenceMap.value=p.iridescenceMap,e(p.iridescenceMap,g.iridescenceMapTransform)),p.iridescenceThicknessMap&&(g.iridescenceThicknessMap.value=p.iridescenceThicknessMap,e(p.iridescenceThicknessMap,g.iridescenceThicknessMapTransform))),p.transmission>0&&(g.transmission.value=p.transmission,g.transmissionSamplerMap.value=A.texture,g.transmissionSamplerSize.value.set(A.width,A.height),p.transmissionMap&&(g.transmissionMap.value=p.transmissionMap,e(p.transmissionMap,g.transmissionMapTransform)),g.thickness.value=p.thickness,p.thicknessMap&&(g.thicknessMap.value=p.thicknessMap,e(p.thicknessMap,g.thicknessMapTransform)),g.attenuationDistance.value=p.attenuationDistance,g.attenuationColor.value.copy(p.attenuationColor)),p.anisotropy>0&&(g.anisotropyVector.value.set(p.anisotropy*Math.cos(p.anisotropyRotation),p.anisotropy*Math.sin(p.anisotropyRotation)),p.anisotropyMap&&(g.anisotropyMap.value=p.anisotropyMap,e(p.anisotropyMap,g.anisotropyMapTransform))),g.specularIntensity.value=p.specularIntensity,g.specularColor.value.copy(p.specularColor),p.specularColorMap&&(g.specularColorMap.value=p.specularColorMap,e(p.specularColorMap,g.specularColorMapTransform)),p.specularIntensityMap&&(g.specularIntensityMap.value=p.specularIntensityMap,e(p.specularIntensityMap,g.specularIntensityMapTransform))}function m(g,p){p.matcap&&(g.matcap.value=p.matcap)}function v(g,p){let A=t.get(p).light;g.referencePosition.value.setFromMatrixPosition(A.matrixWorld),g.nearDistance.value=A.shadow.camera.near,g.farDistance.value=A.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:s}}function pg(i,t,e,n){let s={},r={},o=[],a=i.getParameter(i.MAX_UNIFORM_BUFFER_BINDINGS);function l(M,y){let S=y.program;n.uniformBlockBinding(M,S)}function c(M,y){let S=s[M.id];S===void 0&&(g(M),S=h(M),s[M.id]=S,M.addEventListener("dispose",A));let C=y.program;n.updateUBOMapping(M,C);let _=t.render.frame;r[M.id]!==_&&(u(M),r[M.id]=_)}function h(M){let y=d();M.__bindingPointIndex=y;let S=i.createBuffer(),C=M.__size,_=M.usage;return i.bindBuffer(i.UNIFORM_BUFFER,S),i.bufferData(i.UNIFORM_BUFFER,C,_),i.bindBuffer(i.UNIFORM_BUFFER,null),i.bindBufferBase(i.UNIFORM_BUFFER,y,S),S}function d(){for(let M=0;M<a;M++)if(o.indexOf(M)===-1)return o.push(M),M;return Ft("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function u(M){let y=s[M.id],S=M.uniforms,C=M.__cache;i.bindBuffer(i.UNIFORM_BUFFER,y);for(let _=0,E=S.length;_<E;_++){let R=S[_];if(Array.isArray(R))for(let I=0,L=R.length;I<L;I++)f(R[I],_,I,C);else f(R,_,0,C)}i.bindBuffer(i.UNIFORM_BUFFER,null)}function f(M,y,S,C){if(v(M,y,S,C)===!0){let _=M.__offset,E=M.value;if(Array.isArray(E)){let R=0;for(let I=0;I<E.length;I++){let L=E[I],Y=p(L);m(L,M.__data,R),typeof L!="number"&&typeof L!="boolean"&&!L.isMatrix3&&!ArrayBuffer.isView(L)&&(R+=Y.storage/Float32Array.BYTES_PER_ELEMENT)}}else m(E,M.__data,0);i.bufferSubData(i.UNIFORM_BUFFER,_,M.__data)}}function m(M,y,S){typeof M=="number"||typeof M=="boolean"?y[0]=M:M.isMatrix3?(y[0]=M.elements[0],y[1]=M.elements[1],y[2]=M.elements[2],y[3]=0,y[4]=M.elements[3],y[5]=M.elements[4],y[6]=M.elements[5],y[7]=0,y[8]=M.elements[6],y[9]=M.elements[7],y[10]=M.elements[8],y[11]=0):ArrayBuffer.isView(M)?y.set(new M.constructor(M.buffer,M.byteOffset,y.length)):M.toArray(y,S)}function v(M,y,S,C){let _=M.value,E=y+"_"+S;if(C[E]===void 0)return typeof _=="number"||typeof _=="boolean"?C[E]=_:ArrayBuffer.isView(_)?C[E]=_.slice():C[E]=_.clone(),!0;{let R=C[E];if(typeof _=="number"||typeof _=="boolean"){if(R!==_)return C[E]=_,!0}else{if(ArrayBuffer.isView(_))return!0;if(R.equals(_)===!1)return R.copy(_),!0}}return!1}function g(M){let y=M.uniforms,S=0,C=16;for(let E=0,R=y.length;E<R;E++){let I=Array.isArray(y[E])?y[E]:[y[E]];for(let L=0,Y=I.length;L<Y;L++){let q=I[L],O=Array.isArray(q.value)?q.value:[q.value];for(let z=0,k=O.length;z<k;z++){let $=O[z],et=p($),rt=S%C,ot=rt%et.boundary,_t=rt+ot;S+=ot,_t!==0&&C-_t<et.storage&&(S+=C-_t),q.__data=new Float32Array(et.storage/Float32Array.BYTES_PER_ELEMENT),q.__offset=S,S+=et.storage}}}let _=S%C;return _>0&&(S+=C-_),M.__size=S,M.__cache={},this}function p(M){let y={boundary:0,storage:0};return typeof M=="number"||typeof M=="boolean"?(y.boundary=4,y.storage=4):M.isVector2?(y.boundary=8,y.storage=8):M.isVector3||M.isColor?(y.boundary=16,y.storage=12):M.isVector4?(y.boundary=16,y.storage=16):M.isMatrix3?(y.boundary=48,y.storage=48):M.isMatrix4?(y.boundary=64,y.storage=64):M.isTexture?Nt("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(M)?(y.boundary=16,y.storage=M.byteLength):Nt("WebGLRenderer: Unsupported uniform value type.",M),y}function A(M){let y=M.target;y.removeEventListener("dispose",A);let S=o.indexOf(y.__bindingPointIndex);o.splice(S,1),i.deleteBuffer(s[y.id]),delete s[y.id],delete r[y.id]}function w(){for(let M in s)i.deleteBuffer(s[M]);o=[],s={},r={}}return{bind:l,update:c,dispose:w}}var mg=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),_n=null;function gg(){return _n===null&&(_n=new Er(mg,16,16,jn,xn),_n.name="DFG_LUT",_n.minFilter=Te,_n.magFilter=Te,_n.wrapS=dn,_n.wrapT=dn,_n.generateMipmaps=!1,_n.needsUpdate=!0),_n}var No=class{constructor(t={}){let{canvas:e=Ac(),context:n=null,depth:s=!0,stencil:r=!1,alpha:o=!1,antialias:a=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:d=!1,reversedDepthBuffer:u=!1,outputBufferType:f=Ve}=t;this.isWebGLRenderer=!0;let m;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");m=n.getContextAttributes().alpha}else m=o;let v=f,g=new Set([Zr,$r,qr]),p=new Set([Ve,rn,$i,Zi,Xr,Yr]),A=new Uint32Array(4),w=new Int32Array(4),M=new N,y=null,S=null,C=[],_=[],E=null;this.domElement=e,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=sn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let R=this,I=!1,L=null,Y=null,q=null,O=null;this._outputColorSpace=We;let z=0,k=0,$=null,et=-1,rt=null,ot=new de,_t=new de,Vt=null,te=new zt(0),$t=0,j=e.width,at=e.height,it=1,Ot=null,kt=null,Lt=new de(0,0,j,at),ce=new de(0,0,j,at),Gt=!1,ee=new ki,Ht=!1,Yt=!1,fe=new ue,V=new N,K=new de,vt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},yt=!1;function St(){return $===null?it:1}let P=n;function Dt(b,B){return e.getContext(b,B)}try{let b={alpha:!0,depth:s,stencil:r,antialias:a,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:d};if("setAttribute"in e&&e.setAttribute("data-engine",`three.js r${"185"}`),e.addEventListener("webglcontextlost",pe,!1),e.addEventListener("webglcontextrestored",ae,!1),e.addEventListener("webglcontextcreationerror",ln,!1),P===null){let B="webgl2";if(P=Dt(B,b),P===null)throw Dt(B)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}}catch(b){throw Ft("WebGLRenderer: "+b.message),b}let gt,T,x,U,D,W,nt,lt,Z,J,st,At,dt,ht,Pt,Ut,Wt,F,ct,Q,ut,xt,tt;function Tt(){gt=new Sp(P),gt.init(),ut=new cg(P,gt),T=new mp(P,gt,t,ut),x=new ag(P,gt),T.reversedDepthBuffer&&u&&x.buffers.depth.setReversed(!0),Y=P.createFramebuffer(),q=P.createFramebuffer(),O=P.createFramebuffer(),U=new Tp(P),D=new qm,W=new lg(P,gt,x,D,T,ut,U),nt=new Mp(R),lt=new Ru(P),xt=new fp(P,lt),Z=new Ep(P,lt,U,xt),J=new Cp(P,Z,lt,xt,U),F=new Ap(P,T,W),Pt=new gp(D),st=new Ym(R,nt,gt,T,xt,Pt),At=new fg(R,D),dt=new Zm,ht=new eg(gt),Wt=new dp(R,nt,x,J,m,l),Ut=new og(R,J,T),tt=new pg(P,U,T,x),ct=new pp(P,gt,U),Q=new wp(P,gt,U),U.programs=st.programs,R.capabilities=T,R.extensions=gt,R.properties=D,R.renderLists=dt,R.shadowMap=Ut,R.state=x,R.info=U}Tt(),v!==Ve&&(E=new Ip(v,e.width,e.height,a,s,r));let Et=new ul(R,P);this.xr=Et,this.getContext=function(){return P},this.getContextAttributes=function(){return P.getContextAttributes()},this.forceContextLoss=function(){let b=gt.get("WEBGL_lose_context");b&&b.loseContext()},this.forceContextRestore=function(){let b=gt.get("WEBGL_lose_context");b&&b.restoreContext()},this.getPixelRatio=function(){return it},this.setPixelRatio=function(b){b!==void 0&&(it=b,this.setSize(j,at,!1))},this.getSize=function(b){return b.set(j,at)},this.setSize=function(b,B,X=!0){if(Et.isPresenting){Nt("WebGLRenderer: Can't change size while VR device is presenting.");return}j=b,at=B,e.width=Math.floor(b*it),e.height=Math.floor(B*it),X===!0&&(e.style.width=b+"px",e.style.height=B+"px"),E!==null&&E.setSize(e.width,e.height),this.setViewport(0,0,b,B)},this.getDrawingBufferSize=function(b){return b.set(j*it,at*it).floor()},this.setDrawingBufferSize=function(b,B,X){j=b,at=B,it=X,e.width=Math.floor(b*X),e.height=Math.floor(B*X),this.setViewport(0,0,b,B)},this.setEffects=function(b){if(v===Ve){Ft("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(b){for(let B=0;B<b.length;B++)if(b[B].isOutputPass===!0){Nt("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}E.setEffects(b||[])},this.getCurrentViewport=function(b){return b.copy(ot)},this.getViewport=function(b){return b.copy(Lt)},this.setViewport=function(b,B,X,H){b.isVector4?Lt.set(b.x,b.y,b.z,b.w):Lt.set(b,B,X,H),x.viewport(ot.copy(Lt).multiplyScalar(it).round())},this.getScissor=function(b){return b.copy(ce)},this.setScissor=function(b,B,X,H){b.isVector4?ce.set(b.x,b.y,b.z,b.w):ce.set(b,B,X,H),x.scissor(_t.copy(ce).multiplyScalar(it).round())},this.getScissorTest=function(){return Gt},this.setScissorTest=function(b){x.setScissorTest(Gt=b)},this.setOpaqueSort=function(b){Ot=b},this.setTransparentSort=function(b){kt=b},this.getClearColor=function(b){return b.copy(Wt.getClearColor())},this.setClearColor=function(){Wt.setClearColor(...arguments)},this.getClearAlpha=function(){return Wt.getClearAlpha()},this.setClearAlpha=function(){Wt.setClearAlpha(...arguments)},this.clear=function(b=!0,B=!0,X=!0){let H=0;if(b){let G=!1;if($!==null){let mt=$.texture.format;G=g.has(mt)}if(G){let mt=$.texture.type,Mt=p.has(mt),pt=Wt.getClearColor(),wt=Wt.getClearAlpha(),Ct=pt.r,Xt=pt.g,Zt=pt.b;Mt?(A[0]=Ct,A[1]=Xt,A[2]=Zt,A[3]=wt,P.clearBufferuiv(P.COLOR,0,A)):(w[0]=Ct,w[1]=Xt,w[2]=Zt,w[3]=wt,P.clearBufferiv(P.COLOR,0,w))}else H|=P.COLOR_BUFFER_BIT}B&&(H|=P.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),X&&(H|=P.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),H!==0&&P.clear(H)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(b){b.setRenderer(this),L=b},this.dispose=function(){e.removeEventListener("webglcontextlost",pe,!1),e.removeEventListener("webglcontextrestored",ae,!1),e.removeEventListener("webglcontextcreationerror",ln,!1),Wt.dispose(),dt.dispose(),ht.dispose(),D.dispose(),nt.dispose(),J.dispose(),xt.dispose(),tt.dispose(),st.dispose(),Et.dispose(),Et.removeEventListener("sessionstart",_l),Et.removeEventListener("sessionend",vl),ei.stop()};function pe(b){b.preventDefault(),Xa("WebGLRenderer: Context Lost."),I=!0}function ae(){Xa("WebGLRenderer: Context Restored."),I=!1;let b=U.autoReset,B=Ut.enabled,X=Ut.autoUpdate,H=Ut.needsUpdate,G=Ut.type;Tt(),U.autoReset=b,Ut.enabled=B,Ut.autoUpdate=X,Ut.needsUpdate=H,Ut.type=G}function ln(b){Ft("WebGLRenderer: A WebGL context could not be created. Reason: ",b.statusMessage)}function cn(b){let B=b.target;B.removeEventListener("dispose",cn),Ah(B)}function Ah(b){Ch(b),D.remove(b)}function Ch(b){let B=D.get(b).programs;B!==void 0&&(B.forEach(function(X){st.releaseProgram(X)}),b.isShaderMaterial&&st.releaseShaderCache(b))}this.renderBufferDirect=function(b,B,X,H,G,mt){B===null&&(B=vt);let Mt=G.isMesh&&G.matrixWorld.determinantAffine()<0,pt=Ph(b,B,X,H,G);x.setMaterial(H,Mt);let wt=X.index,Ct=1;if(H.wireframe===!0){if(wt=Z.getWireframeAttribute(X),wt===void 0)return;Ct=2}let Xt=X.drawRange,Zt=X.attributes.position,Rt=Xt.start*Ct,ie=(Xt.start+Xt.count)*Ct;mt!==null&&(Rt=Math.max(Rt,mt.start*Ct),ie=Math.min(ie,(mt.start+mt.count)*Ct)),wt!==null?(Rt=Math.max(Rt,0),ie=Math.min(ie,wt.count)):Zt!=null&&(Rt=Math.max(Rt,0),ie=Math.min(ie,Zt.count));let xe=ie-Rt;if(xe<0||xe===1/0)return;xt.setup(G,H,pt,X,wt);let me,re=ct;if(wt!==null&&(me=lt.get(wt),re=Q,re.setIndex(me)),G.isMesh)H.wireframe===!0?(x.setLineWidth(H.wireframeLinewidth*St()),re.setMode(P.LINES)):re.setMode(P.TRIANGLES);else if(G.isLine){let Ce=H.linewidth;Ce===void 0&&(Ce=1),x.setLineWidth(Ce*St()),G.isLineSegments?re.setMode(P.LINES):G.isLineLoop?re.setMode(P.LINE_LOOP):re.setMode(P.LINE_STRIP)}else G.isPoints?re.setMode(P.POINTS):G.isSprite&&re.setMode(P.TRIANGLES);if(G.isBatchedMesh)if(gt.get("WEBGL_multi_draw"))re.renderMultiDraw(G._multiDrawStarts,G._multiDrawCounts,G._multiDrawCount);else{let Ce=G._multiDrawStarts,bt=G._multiDrawCounts,ke=G._multiDrawCount,Qt=wt?lt.get(wt).bytesPerElement:1,qe=D.get(H).currentProgram.getUniforms();for(let hn=0;hn<ke;hn++)qe.setValue(P,"_gl_DrawID",hn),re.render(Ce[hn]/Qt,bt[hn])}else if(G.isInstancedMesh)re.renderInstances(Rt,xe,G.count);else if(X.isInstancedBufferGeometry){let Ce=X._maxInstanceCount!==void 0?X._maxInstanceCount:1/0,bt=Math.min(X.instanceCount,Ce);re.renderInstances(Rt,xe,bt)}else re.render(Rt,xe)};function xl(b,B,X){b.transparent===!0&&b.side===Fe&&b.forceSinglePass===!1?(b.side=Ae,b.needsUpdate=!0,Vs(b,B,X),b.side=An,b.needsUpdate=!0,Vs(b,B,X),b.side=Fe):Vs(b,B,X)}this.compile=function(b,B,X=null){X===null&&(X=b),S=ht.get(X),S.init(B),_.push(S),X.traverseVisible(function(G){G.isLight&&G.layers.test(B.layers)&&(S.pushLight(G),G.castShadow&&S.pushShadow(G))}),b!==X&&b.traverseVisible(function(G){G.isLight&&G.layers.test(B.layers)&&(S.pushLight(G),G.castShadow&&S.pushShadow(G))}),S.setupLights();let H=new Set;return b.traverse(function(G){if(!(G.isMesh||G.isPoints||G.isLine||G.isSprite))return;let mt=G.material;if(mt)if(Array.isArray(mt))for(let Mt=0;Mt<mt.length;Mt++){let pt=mt[Mt];xl(pt,X,G),H.add(pt)}else xl(mt,X,G),H.add(mt)}),S=_.pop(),H},this.compileAsync=function(b,B,X=null){let H=this.compile(b,B,X);return new Promise(G=>{function mt(){if(H.forEach(function(Mt){D.get(Mt).currentProgram.isReady()&&H.delete(Mt)}),H.size===0){G(b);return}setTimeout(mt,10)}gt.get("KHR_parallel_shader_compile")!==null?mt():setTimeout(mt,10)})};let Vo=null;function Rh(b){Vo&&Vo(b)}function _l(){ei.stop()}function vl(){ei.start()}let ei=new nh;ei.setAnimationLoop(Rh),typeof self<"u"&&ei.setContext(self),this.setAnimationLoop=function(b){Vo=b,Et.setAnimationLoop(b),b===null?ei.stop():ei.start()},Et.addEventListener("sessionstart",_l),Et.addEventListener("sessionend",vl),this.render=function(b,B){if(B!==void 0&&B.isCamera!==!0){Ft("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(I===!0)return;L!==null&&L.renderStart(b,B);let X=Et.enabled===!0&&Et.isPresenting===!0,H=E!==null&&($===null||X)&&E.begin(R,$);if(b.matrixWorldAutoUpdate===!0&&b.updateMatrixWorld(),B.parent===null&&B.matrixWorldAutoUpdate===!0&&B.updateMatrixWorld(),Et.enabled===!0&&Et.isPresenting===!0&&(E===null||E.isCompositing()===!1)&&(Et.cameraAutoUpdate===!0&&Et.updateCamera(B),B=Et.getCamera()),b.isScene===!0&&b.onBeforeRender(R,b,B,$),S=ht.get(b,_.length),S.init(B),S.state.textureUnits=W.getTextureUnits(),_.push(S),fe.multiplyMatrices(B.projectionMatrix,B.matrixWorldInverse),ee.setFromProjectionMatrix(fe,en,B.reversedDepth),Yt=this.localClippingEnabled,Ht=Pt.init(this.clippingPlanes,Yt),y=dt.get(b,C.length),y.init(),C.push(y),Et.enabled===!0&&Et.isPresenting===!0){let Mt=R.xr.getDepthSensingMesh();Mt!==null&&ko(Mt,B,-1/0,R.sortObjects)}ko(b,B,0,R.sortObjects),y.finish(),R.sortObjects===!0&&y.sort(Ot,kt,B.reversedDepth),yt=Et.enabled===!1||Et.isPresenting===!1||Et.hasDepthSensing()===!1,yt&&Wt.addToRenderList(y,b),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),Ht===!0&&Pt.beginShadows();let G=S.state.shadowsArray;if(Ut.render(G,b,B),Ht===!0&&Pt.endShadows(),(H&&E.hasRenderPass())===!1){let Mt=y.opaque,pt=y.transmissive;if(S.setupLights(),B.isArrayCamera){let wt=B.cameras;if(pt.length>0)for(let Ct=0,Xt=wt.length;Ct<Xt;Ct++){let Zt=wt[Ct];bl(Mt,pt,b,Zt)}yt&&Wt.render(b);for(let Ct=0,Xt=wt.length;Ct<Xt;Ct++){let Zt=wt[Ct];yl(y,b,Zt,Zt.viewport)}}else pt.length>0&&bl(Mt,pt,b,B),yt&&Wt.render(b),yl(y,b,B)}$!==null&&k===0&&(W.updateMultisampleRenderTarget($),W.updateRenderTargetMipmap($)),H&&E.end(R),b.isScene===!0&&b.onAfterRender(R,b,B),xt.resetDefaultState(),et=-1,rt=null,_.pop(),_.length>0?(S=_[_.length-1],W.setTextureUnits(S.state.textureUnits),Ht===!0&&Pt.setGlobalState(R.clippingPlanes,S.state.camera)):S=null,C.pop(),C.length>0?y=C[C.length-1]:y=null,L!==null&&L.renderEnd()};function ko(b,B,X,H){if(b.visible===!1)return;if(b.layers.test(B.layers)){if(b.isGroup)X=b.renderOrder;else if(b.isLOD)b.autoUpdate===!0&&b.update(B);else if(b.isLightProbeGrid)S.pushLightProbeGrid(b);else if(b.isLight)S.pushLight(b),b.castShadow&&S.pushShadow(b);else if(b.isSprite){if(!b.frustumCulled||ee.intersectsSprite(b)){H&&K.setFromMatrixPosition(b.matrixWorld).applyMatrix4(fe);let Mt=J.update(b),pt=b.material;pt.visible&&y.push(b,Mt,pt,X,K.z,null)}}else if((b.isMesh||b.isLine||b.isPoints)&&(!b.frustumCulled||ee.intersectsObject(b))){let Mt=J.update(b),pt=b.material;if(H&&(b.boundingSphere!==void 0?(b.boundingSphere===null&&b.computeBoundingSphere(),K.copy(b.boundingSphere.center)):(Mt.boundingSphere===null&&Mt.computeBoundingSphere(),K.copy(Mt.boundingSphere.center)),K.applyMatrix4(b.matrixWorld).applyMatrix4(fe)),Array.isArray(pt)){let wt=Mt.groups;for(let Ct=0,Xt=wt.length;Ct<Xt;Ct++){let Zt=wt[Ct],Rt=pt[Zt.materialIndex];Rt&&Rt.visible&&y.push(b,Mt,Rt,X,K.z,Zt)}}else pt.visible&&y.push(b,Mt,pt,X,K.z,null)}}let mt=b.children;for(let Mt=0,pt=mt.length;Mt<pt;Mt++)ko(mt[Mt],B,X,H)}function yl(b,B,X,H){let{opaque:G,transmissive:mt,transparent:Mt}=b;S.setupLightsView(X),Ht===!0&&Pt.setGlobalState(R.clippingPlanes,X),H&&x.viewport(ot.copy(H)),G.length>0&&zs(G,B,X),mt.length>0&&zs(mt,B,X),Mt.length>0&&zs(Mt,B,X),x.buffers.depth.setTest(!0),x.buffers.depth.setMask(!0),x.buffers.color.setMask(!0),x.setPolygonOffset(!1)}function bl(b,B,X,H){if((X.isScene===!0?X.overrideMaterial:null)!==null)return;if(S.state.transmissionRenderTarget[H.id]===void 0){let Rt=gt.has("EXT_color_buffer_half_float")||gt.has("EXT_color_buffer_float");S.state.transmissionRenderTarget[H.id]=new Xe(1,1,{generateMipmaps:!0,type:Rt?xn:Ve,minFilter:Jn,samples:Math.max(4,T.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:Kt.workingColorSpace})}let mt=S.state.transmissionRenderTarget[H.id],Mt=H.viewport||ot;mt.setSize(Mt.z*R.transmissionResolutionScale,Mt.w*R.transmissionResolutionScale);let pt=R.getRenderTarget(),wt=R.getActiveCubeFace(),Ct=R.getActiveMipmapLevel();R.setRenderTarget(mt),R.getClearColor(te),$t=R.getClearAlpha(),$t<1&&R.setClearColor(16777215,.5),R.clear(),yt&&Wt.render(X);let Xt=R.toneMapping;R.toneMapping=sn;let Zt=H.viewport;if(H.viewport!==void 0&&(H.viewport=void 0),S.setupLightsView(H),Ht===!0&&Pt.setGlobalState(R.clippingPlanes,H),zs(b,X,H),W.updateMultisampleRenderTarget(mt),W.updateRenderTargetMipmap(mt),gt.has("WEBGL_multisampled_render_to_texture")===!1){let Rt=!1;for(let ie=0,xe=B.length;ie<xe;ie++){let me=B[ie],{object:re,geometry:Ce,material:bt,group:ke}=me;if(bt.side===Fe&&re.layers.test(H.layers)){let Qt=bt.side;bt.side=Ae,bt.needsUpdate=!0,Ml(re,X,H,Ce,bt,ke),bt.side=Qt,bt.needsUpdate=!0,Rt=!0}}Rt===!0&&(W.updateMultisampleRenderTarget(mt),W.updateRenderTargetMipmap(mt))}R.setRenderTarget(pt,wt,Ct),R.setClearColor(te,$t),Zt!==void 0&&(H.viewport=Zt),R.toneMapping=Xt}function zs(b,B,X){let H=B.isScene===!0?B.overrideMaterial:null;for(let G=0,mt=b.length;G<mt;G++){let Mt=b[G],{object:pt,geometry:wt,group:Ct}=Mt,Xt=Mt.material;Xt.allowOverride===!0&&H!==null&&(Xt=H),pt.layers.test(X.layers)&&Ml(pt,B,X,wt,Xt,Ct)}}function Ml(b,B,X,H,G,mt){b.onBeforeRender(R,B,X,H,G,mt),b.modelViewMatrix.multiplyMatrices(X.matrixWorldInverse,b.matrixWorld),b.normalMatrix.getNormalMatrix(b.modelViewMatrix),G.onBeforeRender(R,B,X,H,b,mt),G.transparent===!0&&G.side===Fe&&G.forceSinglePass===!1?(G.side=Ae,G.needsUpdate=!0,R.renderBufferDirect(X,B,H,G,b,mt),G.side=An,G.needsUpdate=!0,R.renderBufferDirect(X,B,H,G,b,mt),G.side=Fe):R.renderBufferDirect(X,B,H,G,b,mt),b.onAfterRender(R,B,X,H,G,mt)}function Vs(b,B,X){B.isScene!==!0&&(B=vt);let H=D.get(b),G=S.state.lights,mt=S.state.shadowsArray,Mt=G.state.version,pt=st.getParameters(b,G.state,mt,B,X,S.state.lightProbeGridArray),wt=st.getProgramCacheKey(pt),Ct=H.programs;H.environment=b.isMeshStandardMaterial||b.isMeshLambertMaterial||b.isMeshPhongMaterial?B.environment:null,H.fog=B.fog;let Xt=b.isMeshStandardMaterial||b.isMeshLambertMaterial&&!b.envMap||b.isMeshPhongMaterial&&!b.envMap;H.envMap=nt.get(b.envMap||H.environment,Xt),H.envMapRotation=H.environment!==null&&b.envMap===null?B.environmentRotation:b.envMapRotation,Ct===void 0&&(b.addEventListener("dispose",cn),Ct=new Map,H.programs=Ct);let Zt=Ct.get(wt);if(Zt!==void 0){if(H.currentProgram===Zt&&H.lightsStateVersion===Mt)return El(b,pt),Zt}else pt.uniforms=st.getUniforms(b),L!==null&&b.isNodeMaterial&&L.build(b,X,pt),b.onBeforeCompile(pt,R),Zt=st.acquireProgram(pt,wt),Ct.set(wt,Zt),H.uniforms=pt.uniforms;let Rt=H.uniforms;return(!b.isShaderMaterial&&!b.isRawShaderMaterial||b.clipping===!0)&&(Rt.clippingPlanes=Pt.uniform),El(b,pt),H.needsLights=Dh(b),H.lightsStateVersion=Mt,H.needsLights&&(Rt.ambientLightColor.value=G.state.ambient,Rt.lightProbe.value=G.state.probe,Rt.directionalLights.value=G.state.directional,Rt.directionalLightShadows.value=G.state.directionalShadow,Rt.spotLights.value=G.state.spot,Rt.spotLightShadows.value=G.state.spotShadow,Rt.rectAreaLights.value=G.state.rectArea,Rt.ltc_1.value=G.state.rectAreaLTC1,Rt.ltc_2.value=G.state.rectAreaLTC2,Rt.pointLights.value=G.state.point,Rt.pointLightShadows.value=G.state.pointShadow,Rt.hemisphereLights.value=G.state.hemi,Rt.directionalShadowMatrix.value=G.state.directionalShadowMatrix,Rt.spotLightMatrix.value=G.state.spotLightMatrix,Rt.spotLightMap.value=G.state.spotLightMap,Rt.pointShadowMatrix.value=G.state.pointShadowMatrix),H.lightProbeGrid=S.state.lightProbeGridArray.length>0,H.currentProgram=Zt,H.uniformsList=null,Zt}function Sl(b){if(b.uniformsList===null){let B=b.currentProgram.getUniforms();b.uniformsList=ji.seqWithValue(B.seq,b.uniforms)}return b.uniformsList}function El(b,B){let X=D.get(b);X.outputColorSpace=B.outputColorSpace,X.batching=B.batching,X.batchingColor=B.batchingColor,X.instancing=B.instancing,X.instancingColor=B.instancingColor,X.instancingMorph=B.instancingMorph,X.skinning=B.skinning,X.morphTargets=B.morphTargets,X.morphNormals=B.morphNormals,X.morphColors=B.morphColors,X.morphTargetsCount=B.morphTargetsCount,X.numClippingPlanes=B.numClippingPlanes,X.numIntersection=B.numClipIntersection,X.vertexAlphas=B.vertexAlphas,X.vertexTangents=B.vertexTangents,X.toneMapping=B.toneMapping}function Ih(b,B){if(b.length===0)return null;if(b.length===1)return b[0].texture!==null?b[0]:null;M.setFromMatrixPosition(B.matrixWorld);for(let X=0,H=b.length;X<H;X++){let G=b[X];if(G.texture!==null&&G.boundingBox.containsPoint(M))return G}return null}function Ph(b,B,X,H,G){B.isScene!==!0&&(B=vt),W.resetTextureUnits();let mt=B.fog,Mt=H.isMeshStandardMaterial||H.isMeshLambertMaterial||H.isMeshPhongMaterial?B.environment:null,pt=$===null?R.outputColorSpace:$.isXRRenderTarget===!0?$.texture.colorSpace:Kt.workingColorSpace,wt=H.isMeshStandardMaterial||H.isMeshLambertMaterial&&!H.envMap||H.isMeshPhongMaterial&&!H.envMap,Ct=nt.get(H.envMap||Mt,wt),Xt=H.vertexColors===!0&&!!X.attributes.color&&X.attributes.color.itemSize===4,Zt=!!X.attributes.tangent&&(!!H.normalMap||H.anisotropy>0),Rt=!!X.morphAttributes.position,ie=!!X.morphAttributes.normal,xe=!!X.morphAttributes.color,me=sn;H.toneMapped&&($===null||$.isXRRenderTarget===!0)&&(me=R.toneMapping);let re=X.morphAttributes.position||X.morphAttributes.normal||X.morphAttributes.color,Ce=re!==void 0?re.length:0,bt=D.get(H),ke=S.state.lights;if(Ht===!0&&(Yt===!0||b!==rt)){let le=b===rt&&H.id===et;Pt.setState(H,b,le)}let Qt=!1;H.version===bt.__version?(bt.needsLights&&bt.lightsStateVersion!==ke.state.version||bt.outputColorSpace!==pt||G.isBatchedMesh&&bt.batching===!1||!G.isBatchedMesh&&bt.batching===!0||G.isBatchedMesh&&bt.batchingColor===!0&&G.colorTexture===null||G.isBatchedMesh&&bt.batchingColor===!1&&G.colorTexture!==null||G.isInstancedMesh&&bt.instancing===!1||!G.isInstancedMesh&&bt.instancing===!0||G.isSkinnedMesh&&bt.skinning===!1||!G.isSkinnedMesh&&bt.skinning===!0||G.isInstancedMesh&&bt.instancingColor===!0&&G.instanceColor===null||G.isInstancedMesh&&bt.instancingColor===!1&&G.instanceColor!==null||G.isInstancedMesh&&bt.instancingMorph===!0&&G.morphTexture===null||G.isInstancedMesh&&bt.instancingMorph===!1&&G.morphTexture!==null||bt.envMap!==Ct||H.fog===!0&&bt.fog!==mt||bt.numClippingPlanes!==void 0&&(bt.numClippingPlanes!==Pt.numPlanes||bt.numIntersection!==Pt.numIntersection)||bt.vertexAlphas!==Xt||bt.vertexTangents!==Zt||bt.morphTargets!==Rt||bt.morphNormals!==ie||bt.morphColors!==xe||bt.toneMapping!==me||bt.morphTargetsCount!==Ce||!!bt.lightProbeGrid!=S.state.lightProbeGridArray.length>0)&&(Qt=!0):(Qt=!0,bt.__version=H.version);let qe=bt.currentProgram;Qt===!0&&(qe=Vs(H,B,G),L&&H.isNodeMaterial&&L.onUpdateProgram(H,qe,bt));let hn=!1,Dn=!1,_i=!1,oe=qe.getUniforms(),_e=bt.uniforms;if(x.useProgram(qe.program)&&(hn=!0,Dn=!0,_i=!0),H.id!==et&&(et=H.id,Dn=!0),bt.needsLights){let le=Ih(S.state.lightProbeGridArray,G);bt.lightProbeGrid!==le&&(bt.lightProbeGrid=le,Dn=!0)}if(hn||rt!==b){x.buffers.depth.getReversed()&&b.reversedDepth!==!0&&(b._reversedDepth=!0,b.updateProjectionMatrix()),oe.setValue(P,"projectionMatrix",b.projectionMatrix),oe.setValue(P,"viewMatrix",b.matrixWorldInverse);let Un=oe.map.cameraPosition;Un!==void 0&&Un.setValue(P,V.setFromMatrixPosition(b.matrixWorld)),T.logarithmicDepthBuffer&&oe.setValue(P,"logDepthBufFC",2/(Math.log(b.far+1)/Math.LN2)),(H.isMeshPhongMaterial||H.isMeshToonMaterial||H.isMeshLambertMaterial||H.isMeshBasicMaterial||H.isMeshStandardMaterial||H.isShaderMaterial)&&oe.setValue(P,"isOrthographic",b.isOrthographicCamera===!0),rt!==b&&(rt=b,Dn=!0,_i=!0)}if(bt.needsLights&&(ke.state.directionalShadowMap.length>0&&oe.setValue(P,"directionalShadowMap",ke.state.directionalShadowMap,W),ke.state.spotShadowMap.length>0&&oe.setValue(P,"spotShadowMap",ke.state.spotShadowMap,W),ke.state.pointShadowMap.length>0&&oe.setValue(P,"pointShadowMap",ke.state.pointShadowMap,W)),G.isSkinnedMesh){oe.setOptional(P,G,"bindMatrix"),oe.setOptional(P,G,"bindMatrixInverse");let le=G.skeleton;le&&(le.boneTexture===null&&le.computeBoneTexture(),oe.setValue(P,"boneTexture",le.boneTexture,W))}G.isBatchedMesh&&(oe.setOptional(P,G,"batchingTexture"),oe.setValue(P,"batchingTexture",G._matricesTexture,W),oe.setOptional(P,G,"batchingIdTexture"),oe.setValue(P,"batchingIdTexture",G._indirectTexture,W),oe.setOptional(P,G,"batchingColorTexture"),G._colorsTexture!==null&&oe.setValue(P,"batchingColorTexture",G._colorsTexture,W));let Nn=X.morphAttributes;if((Nn.position!==void 0||Nn.normal!==void 0||Nn.color!==void 0)&&F.update(G,X,qe),(Dn||bt.receiveShadow!==G.receiveShadow)&&(bt.receiveShadow=G.receiveShadow,oe.setValue(P,"receiveShadow",G.receiveShadow)),(H.isMeshStandardMaterial||H.isMeshLambertMaterial||H.isMeshPhongMaterial)&&H.envMap===null&&B.environment!==null&&(_e.envMapIntensity.value=B.environmentIntensity),_e.dfgLUT!==void 0&&(_e.dfgLUT.value=gg()),Dn){if(oe.setValue(P,"toneMappingExposure",R.toneMappingExposure),bt.needsLights&&Lh(_e,_i),mt&&H.fog===!0&&At.refreshFogUniforms(_e,mt),At.refreshMaterialUniforms(_e,H,it,at,S.state.transmissionRenderTarget[b.id]),bt.needsLights&&bt.lightProbeGrid){let le=bt.lightProbeGrid;_e.probesSH.value=le.texture,_e.probesMin.value.copy(le.boundingBox.min),_e.probesMax.value.copy(le.boundingBox.max),_e.probesResolution.value.copy(le.resolution)}ji.upload(P,Sl(bt),_e,W)}if(H.isShaderMaterial&&H.uniformsNeedUpdate===!0&&(ji.upload(P,Sl(bt),_e,W),H.uniformsNeedUpdate=!1),H.isSpriteMaterial&&oe.setValue(P,"center",G.center),oe.setValue(P,"modelViewMatrix",G.modelViewMatrix),oe.setValue(P,"normalMatrix",G.normalMatrix),oe.setValue(P,"modelMatrix",G.matrixWorld),H.uniformsGroups!==void 0){let le=H.uniformsGroups;for(let Un=0,vi=le.length;Un<vi;Un++){let wl=le[Un];tt.update(wl,qe),tt.bind(wl,qe)}}return qe}function Lh(b,B){b.ambientLightColor.needsUpdate=B,b.lightProbe.needsUpdate=B,b.directionalLights.needsUpdate=B,b.directionalLightShadows.needsUpdate=B,b.pointLights.needsUpdate=B,b.pointLightShadows.needsUpdate=B,b.spotLights.needsUpdate=B,b.spotLightShadows.needsUpdate=B,b.rectAreaLights.needsUpdate=B,b.hemisphereLights.needsUpdate=B}function Dh(b){return b.isMeshLambertMaterial||b.isMeshToonMaterial||b.isMeshPhongMaterial||b.isMeshStandardMaterial||b.isShadowMaterial||b.isShaderMaterial&&b.lights===!0}this.getActiveCubeFace=function(){return z},this.getActiveMipmapLevel=function(){return k},this.getRenderTarget=function(){return $},this.setRenderTargetTextures=function(b,B,X){let H=D.get(b);H.__autoAllocateDepthBuffer=b.resolveDepthBuffer===!1,H.__autoAllocateDepthBuffer===!1&&(H.__useRenderToTexture=!1),D.get(b.texture).__webglTexture=B,D.get(b.depthTexture).__webglTexture=H.__autoAllocateDepthBuffer?void 0:X,H.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(b,B){let X=D.get(b);X.__webglFramebuffer=B,X.__useDefaultFramebuffer=B===void 0},this.setRenderTarget=function(b,B=0,X=0){$=b,z=B,k=X;let H=null,G=!1,mt=!1;if(b){let pt=D.get(b);if(pt.__useDefaultFramebuffer!==void 0){x.bindFramebuffer(P.FRAMEBUFFER,pt.__webglFramebuffer),ot.copy(b.viewport),_t.copy(b.scissor),Vt=b.scissorTest,x.viewport(ot),x.scissor(_t),x.setScissorTest(Vt),et=-1;return}else if(pt.__webglFramebuffer===void 0)W.setupRenderTarget(b);else if(pt.__hasExternalTextures)W.rebindTextures(b,D.get(b.texture).__webglTexture,D.get(b.depthTexture).__webglTexture);else if(b.depthBuffer){let Xt=b.depthTexture;if(pt.__boundDepthTexture!==Xt){if(Xt!==null&&D.has(Xt)&&(b.width!==Xt.image.width||b.height!==Xt.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");W.setupDepthRenderbuffer(b)}}let wt=b.texture;(wt.isData3DTexture||wt.isDataArrayTexture||wt.isCompressedArrayTexture)&&(mt=!0);let Ct=D.get(b).__webglFramebuffer;b.isWebGLCubeRenderTarget?(Array.isArray(Ct[B])?H=Ct[B][X]:H=Ct[B],G=!0):b.samples>0&&W.useMultisampledRTT(b)===!1?H=D.get(b).__webglMultisampledFramebuffer:Array.isArray(Ct)?H=Ct[X]:H=Ct,ot.copy(b.viewport),_t.copy(b.scissor),Vt=b.scissorTest}else ot.copy(Lt).multiplyScalar(it).floor(),_t.copy(ce).multiplyScalar(it).floor(),Vt=Gt;if(X!==0&&(H=Y),x.bindFramebuffer(P.FRAMEBUFFER,H)&&x.drawBuffers(b,H),x.viewport(ot),x.scissor(_t),x.setScissorTest(Vt),G){let pt=D.get(b.texture);P.framebufferTexture2D(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_CUBE_MAP_POSITIVE_X+B,pt.__webglTexture,X)}else if(mt){let pt=B;for(let wt=0;wt<b.textures.length;wt++){let Ct=D.get(b.textures[wt]);P.framebufferTextureLayer(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0+wt,Ct.__webglTexture,X,pt)}}else if(b!==null&&X!==0){let pt=D.get(b.texture);P.framebufferTexture2D(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,pt.__webglTexture,X)}et=-1},this.readRenderTargetPixels=function(b,B,X,H,G,mt,Mt,pt=0){if(!(b&&b.isWebGLRenderTarget)){Ft("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let wt=D.get(b).__webglFramebuffer;if(b.isWebGLCubeRenderTarget&&Mt!==void 0&&(wt=wt[Mt]),wt){x.bindFramebuffer(P.FRAMEBUFFER,wt);try{let Ct=b.textures[pt],Xt=Ct.format,Zt=Ct.type;if(b.textures.length>1&&P.readBuffer(P.COLOR_ATTACHMENT0+pt),!T.textureFormatReadable(Xt)){Ft("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!T.textureTypeReadable(Zt)){Ft("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}B>=0&&B<=b.width-H&&X>=0&&X<=b.height-G&&P.readPixels(B,X,H,G,ut.convert(Xt),ut.convert(Zt),mt)}finally{let Ct=$!==null?D.get($).__webglFramebuffer:null;x.bindFramebuffer(P.FRAMEBUFFER,Ct)}}},this.readRenderTargetPixelsAsync=async function(b,B,X,H,G,mt,Mt,pt=0){if(!(b&&b.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let wt=D.get(b).__webglFramebuffer;if(b.isWebGLCubeRenderTarget&&Mt!==void 0&&(wt=wt[Mt]),wt)if(B>=0&&B<=b.width-H&&X>=0&&X<=b.height-G){x.bindFramebuffer(P.FRAMEBUFFER,wt);let Ct=b.textures[pt],Xt=Ct.format,Zt=Ct.type;if(b.textures.length>1&&P.readBuffer(P.COLOR_ATTACHMENT0+pt),!T.textureFormatReadable(Xt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!T.textureTypeReadable(Zt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let Rt=P.createBuffer();P.bindBuffer(P.PIXEL_PACK_BUFFER,Rt),P.bufferData(P.PIXEL_PACK_BUFFER,mt.byteLength,P.STREAM_READ),P.readPixels(B,X,H,G,ut.convert(Xt),ut.convert(Zt),0);let ie=$!==null?D.get($).__webglFramebuffer:null;x.bindFramebuffer(P.FRAMEBUFFER,ie);let xe=P.fenceSync(P.SYNC_GPU_COMMANDS_COMPLETE,0);return P.flush(),await Rc(P,xe,4),P.bindBuffer(P.PIXEL_PACK_BUFFER,Rt),P.getBufferSubData(P.PIXEL_PACK_BUFFER,0,mt),P.deleteBuffer(Rt),P.deleteSync(xe),mt}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(b,B=null,X=0){let H=Math.pow(2,-X),G=Math.floor(b.image.width*H),mt=Math.floor(b.image.height*H),Mt=B!==null?B.x:0,pt=B!==null?B.y:0;W.setTexture2D(b,0),P.copyTexSubImage2D(P.TEXTURE_2D,X,0,0,Mt,pt,G,mt),x.unbindTexture()},this.copyTextureToTexture=function(b,B,X=null,H=null,G=0,mt=0){let Mt,pt,wt,Ct,Xt,Zt,Rt,ie,xe,me=b.isCompressedTexture?b.mipmaps[mt]:b.image;if(X!==null)Mt=X.max.x-X.min.x,pt=X.max.y-X.min.y,wt=X.isBox3?X.max.z-X.min.z:1,Ct=X.min.x,Xt=X.min.y,Zt=X.isBox3?X.min.z:0;else{let _e=Math.pow(2,-G);Mt=Math.floor(me.width*_e),pt=Math.floor(me.height*_e),b.isDataArrayTexture?wt=me.depth:b.isData3DTexture?wt=Math.floor(me.depth*_e):wt=1,Ct=0,Xt=0,Zt=0}H!==null?(Rt=H.x,ie=H.y,xe=H.z):(Rt=0,ie=0,xe=0);let re=ut.convert(B.format),Ce=ut.convert(B.type),bt;B.isData3DTexture?(W.setTexture3D(B,0),bt=P.TEXTURE_3D):B.isDataArrayTexture||B.isCompressedArrayTexture?(W.setTexture2DArray(B,0),bt=P.TEXTURE_2D_ARRAY):(W.setTexture2D(B,0),bt=P.TEXTURE_2D),x.activeTexture(P.TEXTURE0),x.pixelStorei(P.UNPACK_FLIP_Y_WEBGL,B.flipY),x.pixelStorei(P.UNPACK_PREMULTIPLY_ALPHA_WEBGL,B.premultiplyAlpha),x.pixelStorei(P.UNPACK_ALIGNMENT,B.unpackAlignment);let ke=x.getParameter(P.UNPACK_ROW_LENGTH),Qt=x.getParameter(P.UNPACK_IMAGE_HEIGHT),qe=x.getParameter(P.UNPACK_SKIP_PIXELS),hn=x.getParameter(P.UNPACK_SKIP_ROWS),Dn=x.getParameter(P.UNPACK_SKIP_IMAGES);x.pixelStorei(P.UNPACK_ROW_LENGTH,me.width),x.pixelStorei(P.UNPACK_IMAGE_HEIGHT,me.height),x.pixelStorei(P.UNPACK_SKIP_PIXELS,Ct),x.pixelStorei(P.UNPACK_SKIP_ROWS,Xt),x.pixelStorei(P.UNPACK_SKIP_IMAGES,Zt);let _i=b.isDataArrayTexture||b.isData3DTexture,oe=B.isDataArrayTexture||B.isData3DTexture;if(b.isDepthTexture){let _e=D.get(b),Nn=D.get(B),le=D.get(_e.__renderTarget),Un=D.get(Nn.__renderTarget);x.bindFramebuffer(P.READ_FRAMEBUFFER,le.__webglFramebuffer),x.bindFramebuffer(P.DRAW_FRAMEBUFFER,Un.__webglFramebuffer);for(let vi=0;vi<wt;vi++)_i&&(P.framebufferTextureLayer(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,D.get(b).__webglTexture,G,Zt+vi),P.framebufferTextureLayer(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,D.get(B).__webglTexture,mt,xe+vi)),P.blitFramebuffer(Ct,Xt,Mt,pt,Rt,ie,Mt,pt,P.DEPTH_BUFFER_BIT,P.NEAREST);x.bindFramebuffer(P.READ_FRAMEBUFFER,null),x.bindFramebuffer(P.DRAW_FRAMEBUFFER,null)}else if(G!==0||b.isRenderTargetTexture||D.has(b)){let _e=D.get(b),Nn=D.get(B);x.bindFramebuffer(P.READ_FRAMEBUFFER,q),x.bindFramebuffer(P.DRAW_FRAMEBUFFER,O);for(let le=0;le<wt;le++)_i?P.framebufferTextureLayer(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,_e.__webglTexture,G,Zt+le):P.framebufferTexture2D(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,_e.__webglTexture,G),oe?P.framebufferTextureLayer(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,Nn.__webglTexture,mt,xe+le):P.framebufferTexture2D(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,Nn.__webglTexture,mt),G!==0?P.blitFramebuffer(Ct,Xt,Mt,pt,Rt,ie,Mt,pt,P.COLOR_BUFFER_BIT,P.NEAREST):oe?P.copyTexSubImage3D(bt,mt,Rt,ie,xe+le,Ct,Xt,Mt,pt):P.copyTexSubImage2D(bt,mt,Rt,ie,Ct,Xt,Mt,pt);x.bindFramebuffer(P.READ_FRAMEBUFFER,null),x.bindFramebuffer(P.DRAW_FRAMEBUFFER,null)}else oe?b.isDataTexture||b.isData3DTexture?P.texSubImage3D(bt,mt,Rt,ie,xe,Mt,pt,wt,re,Ce,me.data):B.isCompressedArrayTexture?P.compressedTexSubImage3D(bt,mt,Rt,ie,xe,Mt,pt,wt,re,me.data):P.texSubImage3D(bt,mt,Rt,ie,xe,Mt,pt,wt,re,Ce,me):b.isDataTexture?P.texSubImage2D(P.TEXTURE_2D,mt,Rt,ie,Mt,pt,re,Ce,me.data):b.isCompressedTexture?P.compressedTexSubImage2D(P.TEXTURE_2D,mt,Rt,ie,me.width,me.height,re,me.data):P.texSubImage2D(P.TEXTURE_2D,mt,Rt,ie,Mt,pt,re,Ce,me);x.pixelStorei(P.UNPACK_ROW_LENGTH,ke),x.pixelStorei(P.UNPACK_IMAGE_HEIGHT,Qt),x.pixelStorei(P.UNPACK_SKIP_PIXELS,qe),x.pixelStorei(P.UNPACK_SKIP_ROWS,hn),x.pixelStorei(P.UNPACK_SKIP_IMAGES,Dn),mt===0&&B.generateMipmaps&&P.generateMipmap(bt),x.unbindTexture()},this.initRenderTarget=function(b){D.get(b).__webglFramebuffer===void 0&&W.setupRenderTarget(b)},this.initTexture=function(b){b.isCubeTexture?W.setTextureCube(b,0):b.isData3DTexture?W.setTexture3D(b,0):b.isDataArrayTexture||b.isCompressedArrayTexture?W.setTexture2DArray(b,0):W.setTexture2D(b,0),x.unbindTexture()},this.resetState=function(){z=0,k=0,$=null,x.reset(),xt.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return en}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;let e=this.getContext();e.drawingBufferColorSpace=Kt._getDrawingBufferColorSpace(t),e.unpackColorSpace=Kt._getUnpackColorSpace()}};var _g=1-Math.pow(.001,.0033333333333333335),dl=.6,vg=.25,yg=.25,Oo={x:0,y:0,z:0,r:120},fl=class{state=7;next(){return this.state=(this.state*1664525+1013904223)%4294967296,this.state/4294967296}jiggle(){return(this.next()-.5)*1e-6}};function bg(i,t,e){let s=new Float64Array(721),r=t,o=0;for(let h=1;h<=720;h++){let d=h/720*Math.PI*2,u=Math.cos(d)*t,f=Math.sin(d)*e;s[h]=(s[h-1]??0)+Math.hypot(u-r,f-o),r=u,o=f}let a=s[720]??1,l=[],c=0;for(let h=0;h<i;h++){let d=(h/i+.75)%1*a;for(c=0;c<720&&(s[c+1]??a)<d;)c++;l.push(c/720*Math.PI*2)}return l}function pi(i){return 30*Math.sqrt(Math.max(1,i))+34}function pl(i,t,e){let n=[...i.entries()],s=new Map;if(n.length===0)return s;let r=0;if(e!==void 0&&i.has(e)&&n.length>1&&(r=pi(i.get(e)??1),s.set(e,{x:0,y:0,z:0,r}),n=n.filter(([d])=>d!==e)),n.length===1){let d=n[0];if(d){let u=r>0?r+pi(d[1]):0;s.set(d[0],{x:u,y:0,z:0,r:pi(d[1])})}return s}let o=n.length,a=Math.pow(Math.max(.7,Math.min(2.2,t)),.85),c=bg(o,a,1/a).map((d,u)=>({x:Math.cos(d)*a,y:u%2===0?.26:-.26,z:Math.sin(d)/a})),h=0;for(let d=0;d<o;d++)for(let u=d+1;u<o;u++){let f=c[d],m=c[u],v=n[d],g=n[u];if(!f||!m||!v||!g)continue;let p=Math.hypot(f.x-m.x,f.y-m.y,f.z-m.z);p<=0||(h=Math.max(h,(pi(v[1])+pi(g[1]))/p))}return h*=1.18,r>0&&n.forEach(([,d],u)=>{let f=c[u];if(!f)return;let m=Math.hypot(f.x,f.y,f.z);m<=0||(h=Math.max(h,(r+pi(d))*1.12/m))}),n.forEach(([d,u],f)=>{let m=c[f]??{x:0,y:0,z:0};s.set(d,{x:m.x*h,y:m.y*h,z:m.z*h,r:pi(u)})}),s}var Mg=Math.PI*(3-Math.sqrt(5));function ch(i){return i.x!==void 0&&i.y!==void 0&&i.z!==void 0}function Sg(i,t,e){let n=new Map,s=0;for(let a of i)ch(a)||(n.set(a.group,(n.get(a.group)??0)+1),s+=1);let r=new Map,o=0;return i.map(a=>{if(ch(a))return{id:a.id,group:a.group,radius:a.radius,x:a.x,y:a.y,z:a.z,vx:0,vy:0,vz:0,fx:null,fy:null,fz:null};let l=r.get(a.group)??0;r.set(a.group,l+1);let c=t==="grouped"?l:o++,h=(t==="grouped"?n.get(a.group):s)??1,d=t==="grouped"?e.get(a.group)??Oo:Oo,u=9*Math.sqrt(c+.5),f=c*Mg,m=1-2*(c+.5)/h,v=Math.sqrt(Math.max(0,1-m*m));return{id:a.id,group:a.group,radius:a.radius,x:d.x+u*v*Math.cos(f),y:d.y+u*m,z:d.z+u*v*Math.sin(f),vx:0,vy:0,vz:0,fx:null,fy:null,fz:null}})}function Eg(i,t,e){let n=[],s=new Map;for(let o of i)!t.has(o.source)||!t.has(o.target)||(n.push(o),s.set(o.source,(s.get(o.source)??0)+1),s.set(o.target,(s.get(o.target)??0)+1));let r=[];for(let o of n){let a=t.get(o.source),l=t.get(o.target);if(!a||!l)continue;let c=a.group===l.group,h=e==="grouped"?c?62:190:76,d=e==="grouped"?c?.5:.015:.6,u=s.get(o.source)??0,f=s.get(o.target)??0;r.push({source:a,target:l,distance:h,strength:d,bias:u/(u+f)})}return r}var Fs=class{nodes;nodesById;links;layout;centres;rng=new fl;simAlpha=1;simAlphaTarget=0;constructor(t){this.layout=t.layout,this.centres=t.centres,this.nodes=Sg(t.nodes,t.layout,t.centres),this.nodesById=new Map(this.nodes.map(e=>[e.id,e])),this.links=Eg(t.links,this.nodesById,t.layout)}byId(t){return this.nodesById.get(t)}alpha(){return this.simAlpha}reheat(){this.simAlphaTarget=vg,this.simAlpha=Math.max(this.simAlpha,yg)}cool(){this.simAlphaTarget=0}pin(t,e,n,s){let r=this.nodesById.get(t);r&&(r.fx=e,r.fy=n,r.fz=s)}unpin(t){let e=this.nodesById.get(t);e&&(e.fx=null,e.fy=null,e.fz=null)}tick(t=1){for(let e=0;e<t;e++)this.stepOnce()}stepOnce(){this.simAlpha+=(this.simAlphaTarget-this.simAlpha)*_g,this.applyCharge(),this.applyLink(),this.layout==="free"&&this.applyCenterMeanShift(),this.applyPositional(),this.applyCollide();for(let t of this.nodes)t.fx!==null&&t.fy!==null&&t.fz!==null?(t.x=t.fx,t.y=t.fy,t.z=t.fz,t.vx=0,t.vy=0,t.vz=0):(t.vx*=dl,t.vy*=dl,t.vz*=dl,t.x+=t.vx,t.y+=t.vy,t.z+=t.vz)}centreOf(t){return this.centres.get(t)??Oo}applyCharge(){let t=this.layout==="grouped"?-165:-150,e=this.layout==="grouped"?300:520,n=e*e,s=this.nodes;for(let r=0;r<s.length;r++){let o=s[r];if(o)for(let a=r+1;a<s.length;a++){let l=s[a];if(!l)continue;let c=l.x-o.x,h=l.y-o.y,d=l.z-o.z,u=c*c+h*h+d*d;if(u===0&&(c=this.rng.jiggle(),h=this.rng.jiggle(),d=this.rng.jiggle(),u=c*c+h*h+d*d),u>=n)continue;u<1&&(u=Math.sqrt(u));let f=t*this.simAlpha/u;o.vx+=c*f,o.vy+=h*f,o.vz+=d*f,l.vx-=c*f,l.vy-=h*f,l.vz-=d*f}}}applyLink(){for(let t of this.links){let{source:e,target:n,distance:s,strength:r,bias:o}=t,a=n.x+n.vx-e.x-e.vx,l=n.y+n.vy-e.y-e.vy,c=n.z+n.vz-e.z-e.vz,h=Math.sqrt(a*a+l*l+c*c);h===0&&(a=this.rng.jiggle(),l=this.rng.jiggle(),c=this.rng.jiggle(),h=Math.sqrt(a*a+l*l+c*c));let d=(h-s)/h*this.simAlpha*r;a*=d,l*=d,c*=d,n.vx-=a*o,n.vy-=l*o,n.vz-=c*o;let u=1-o;e.vx+=a*u,e.vy+=l*u,e.vz+=c*u}}applyCenterMeanShift(){let t=this.nodes,e=t.length;if(e===0)return;let n=0,s=0,r=0;for(let c of t)n+=c.x,s+=c.y,r+=c.z;let o=n/e,a=s/e,l=r/e;for(let c of t)c.x-=o,c.y-=a,c.z-=l}applyPositional(){let t=this.layout==="grouped"?.15:.055;for(let e of this.nodes){let n=this.layout==="grouped"?this.centreOf(e.group):Oo;e.vx+=(n.x-e.x)*t*this.simAlpha,e.vy+=(n.y-e.y)*t*this.simAlpha,e.vz+=(n.z-e.z)*t*this.simAlpha}}applyCollide(){let t=this.nodes,e=.9;for(let n=0;n<t.length;n++){let s=t[n];if(!s)continue;let r=s.radius+5,o=r*r,a=s.x+s.vx,l=s.y+s.vy,c=s.z+s.vz;for(let h=n+1;h<t.length;h++){let d=t[h];if(!d)continue;let u=d.radius+5,f=r+u,m=a-(d.x+d.vx),v=l-(d.y+d.vy),g=c-(d.z+d.vz),p=m*m+v*v+g*g;if(p>=f*f)continue;m===0&&(m=this.rng.jiggle(),p+=m*m),v===0&&(v=this.rng.jiggle(),p+=v*v),g===0&&(g=this.rng.jiggle(),p+=g*g),p=Math.sqrt(p);let A=(f-p)/p*e,w=m*A,M=v*A,y=g*A,S=u*u,C=S/(o+S),_=1-C;s.vx+=w*C,s.vy+=M*C,s.vz+=y*C,d.vx-=w*_,d.vy-=M*_,d.vz-=y*_}}}};var Pn="#FAF9F6",Ln="#C28E0E",mi=new Map([["parties",{colour:"#9AA0A8",ink:"#5A616B"}],["unions",{colour:"#E15759",ink:"#A93843"}],["finance",{colour:"#4E79A7",ink:"#365F86"}],["individuals",{colour:"#79706E",ink:"#57504E"}],["property",{colour:"#F28E2B",ink:"#A85A0F"}],["mining & energy",{colour:"#9C755F",ink:"#6E4F3D"}],["hospitality",{colour:"#EDC948",ink:"#7A6414"}],["media & tech",{colour:"#76B7B2",ink:"#3E7A75"}],["health & pharma",{colour:"#59A14F",ink:"#3B7134"}],["gambling",{colour:"#B07AA1",ink:"#7D5273"}],["legal & lobbying",{colour:"#6A51A3",ink:"#4A3775"}],["defence & security",{colour:"#37474F",ink:"#263238"}],["agriculture",{colour:"#6B8E23",ink:"#4A6318"}],["retail",{colour:"#FF9DA7",ink:"#B04A56"}],["tobacco & alcohol",{colour:"#A65628",ink:"#7A3C1B"}],["other",{colour:"#999966",ink:"#6B6B3D"}]]),wg={colour:"#999966",ink:"#6B6B3D"};function yn(i){return mi.get(i)??wg}var gi=40,Tg=.22,Ag=3.2,hh=380,Cg=520,Rg=230,uh=560,Ig=.22,Pg=48,dh=.35,fh=Math.PI-.55,Lg=68,Dg=86,Ng=420,Ug=560,Fg=2,ml=17,an=6;function Og(i){return Math.min(88,15+6.2*Math.sqrt(i))}function Bg(i){return i<.5?4*i*i*i:1-Math.pow(-2*i+2,3)/2}function ph(i){return Math.max(.24,Math.min(1.9,.2+.42*Math.log10(1+Math.max(0,i))))}function mh(i){return .1+.14*Math.max(0,Math.min(1,Math.log10(1+Math.max(0,i))/4))}function zg(i){return Math.max(0,Math.min(1,Math.log10(1+Math.max(0,i))/4))}var Vg=`
attribute vec4 flowColor;
attribute float flowT;
attribute float flowSeed;
attribute float flowKind;
varying vec4 vFlowColor;
varying float vFlowT;
varying float vFlowSeed;
varying float vFlowKind;
void main() {
  vFlowColor = flowColor;
  vFlowT = flowT;
  vFlowSeed = flowSeed;
  vFlowKind = flowKind;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,kg=`
uniform float uPhase;
uniform float uReduced;
varying vec4 vFlowColor;
varying float vFlowT;
varying float vFlowSeed;
varying float vFlowKind;
void main() {
  float alpha = vFlowColor.a;
  if (vFlowKind < 0.5) {
    if (uReduced > 0.5) {
      alpha *= mix(0.68, 1.0, vFlowT);
    } else {
      float cycle = fract(vFlowT - uPhase - vFlowSeed);
      float distanceToDash = min(cycle, 1.0 - cycle);
      float dash = 1.0 - smoothstep(0.035, 0.09, distanceToDash);
      alpha *= 0.72 + 0.48 * dash;
    }
  } else {
    alpha *= uReduced > 0.5 ? 0.78 : 0.2;
  }
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(vFlowColor.rgb, min(alpha, 0.82));
}
`;function Hg(i){let t=new Map;i.forEach((n,s)=>{let r=n.source<n.target?`${n.source} ${n.target}`:`${n.target} ${n.source}`,o=t.get(r);o?o.push(s):t.set(r,[s])});let e=new Array(i.length).fill(0);for(let n of t.values())n.length!==1&&n.forEach((s,r)=>{e[s]=-1+2*r/(n.length-1)});return e}function gh(){try{let i=document.createElement("canvas");return!!(i.getContext("webgl2")??i.getContext("webgl"))}catch{return!1}}function Gg(){let i=[],t=[];for(let e of mi.values())i.push(new zt(e.colour)),t.push(e.ink);return{cats:i,inks:t,surface:new zt(Pn),accent:new zt(Ln)}}var Bo=class{canvas;labelLayer;onSelect;onEdgePick=null;renderer;scene=new ds;camera;nodeGroup=new Je;territoryGroup=new Je;hemi;key;fill;fog;sphereGeo=new hi(1,40,24);shellGeo=new hi(1,32,18);edgeGeometry=new ze;edgeUniforms={uPhase:{value:0},uReduced:{value:0}};edgeMaterial;edgeMesh;edgePositions=new Float32Array(0);edgeColours=new Float32Array(0);edgeTimes=new Float32Array(0);edgeSeeds=new Float32Array(0);edgeKinds=new Float32Array(0);ringGeo=new Gi(1.18,1.32,48);territoryGeo=new hi(1,28,18);haloGeo=new Gi(1,1.045,64);haloGroup=new Je;halos=new Map;overlay=null;selectionRing;selectionRingMaterial;traceRing;traceRingMaterial;palette;popup;popupName;popupMeta;popupCounts;popupHint;placedLabelBoxes=[];boxPool=[];discs=[];measureCtx=null;labelFont="";captionFont="";captionSpacing=0;data=null;sim=null;centres=new Map;nodeVisuals=new Map;edgeVisuals=[];flowVisuals=[];territories=[];captionRank=[];hubs=new Map;hubGroup=new Je;paintRank=[];worldCentre=new N;worldRadius=320;emphasis={selectedId:null,pathEdges:null,pathFrom:null};hoveredId=null;hoveredHub=null;neighbourIds=null;pathNodeIds=null;pathEdgeKeys=null;insets={left:0,right:0,top:0,bottom:0};view;distGoal;tween=null;idleSpin;idleAnchor=-.5;idlePhase=0;reduced;reducedQuery=null;onContextLost=null;onReducedChange=t=>{this.reduced=t.matches,this.edgeUniforms.uReduced.value=t.matches?1:0,t.matches&&(this.idleSpin=!1),this.renderDirty=!0};viewOwnedFlag=!1;focusOwnedFlag=!1;fitDist=420;pointers=new Map;orbit=null;pinch=null;drag=null;gestured=!1;hoverPos=null;hoverDirty=!1;raycaster=new Ss;frameHandle=null;lastFrame=performance.now();frameCount=0;lastFlowPaint=0;renderDirty=!0;paused=!1;resizeObserver;disposed=!1;width=1;height=1;constructor(t,e,n,s){this.canvas=t,this.labelLayer=e,this.onSelect=n,s&&(this.onContextLost=r=>{r.preventDefault(),s()},t.addEventListener("webglcontextlost",this.onContextLost)),this.reducedQuery=typeof globalThis.matchMedia=="function"?globalThis.matchMedia("(prefers-reduced-motion: reduce)"):null,this.reduced=this.reducedQuery?.matches??!1,this.edgeUniforms.uReduced.value=this.reduced?1:0,this.idleSpin=!this.reduced,this.reducedQuery?.addEventListener("change",this.onReducedChange),this.renderer=new No({canvas:t,antialias:!0,alpha:!1}),this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,2)),this.edgeMaterial=new Ue({uniforms:this.edgeUniforms,vertexShader:Vg,fragmentShader:kg,transparent:!0,depthWrite:!1,side:Fe}),this.edgeMesh=new ge(this.edgeGeometry,this.edgeMaterial),this.edgeMesh.frustumCulled=!1,this.edgeMesh.raycast=()=>{},this.popup=document.createElement("div"),this.popup.className="rp-map3d-popup",this.popup.style.display="none",this.popupName=document.createElement("div"),this.popupName.className="rp-map3d-popup-name",this.popupMeta=document.createElement("div"),this.popupMeta.className="rp-map3d-popup-meta",this.popupCounts=document.createElement("div"),this.popupCounts.className="rp-map3d-popup-counts",this.popupHint=document.createElement("div"),this.popupHint.className="rp-map3d-popup-hint",this.popupHint.textContent="Click for details",this.popup.append(this.popupName,this.popupMeta,this.popupCounts,this.popupHint),e.appendChild(this.popup),this.palette=Gg(),this.camera=new Pe(gi,1.5,2,9e3),this.fog=new us(this.palette.surface.clone(),600,2400),this.scene.fog=this.fog,this.scene.add(this.territoryGroup),this.scene.add(this.edgeMesh),this.scene.add(this.nodeGroup),this.scene.add(this.hubGroup),this.scene.add(this.haloGroup),this.hemi=new bs(16777215,8947848,.95),this.key=new Yi(16777215,1.15),this.key.position.set(.55,1,.4),this.fill=new Yi(16777215,.3),this.fill.position.set(-.6,-.35,-.7),this.scene.add(this.hemi,this.key,this.fill),this.selectionRingMaterial=new nn({transparent:!0,opacity:0,depthWrite:!1,side:Fe}),this.selectionRing=new ge(this.ringGeo,this.selectionRingMaterial),this.selectionRing.visible=!1,this.scene.add(this.selectionRing),this.traceRingMaterial=this.selectionRingMaterial.clone(),this.traceRing=new ge(this.ringGeo,this.traceRingMaterial),this.traceRing.visible=!1,this.scene.add(this.traceRing),this.applyPaletteToScene(),this.view={target:new N,theta:-.5,phi:.95,dist:640},this.distGoal=this.view.dist,this.resizeObserver=new ResizeObserver(()=>this.handleResize()),this.resizeObserver.observe(t.parentElement??t),this.handleResize(),this.bindPointerHandlers(),this.frameHandle=requestAnimationFrame(this.frame)}applyPaletteToScene(){let t=this.palette.surface;this.renderer.setClearColor(t,1),this.fog.color.copy(t),this.hemi.color.copy(t.clone().lerp(new zt(16777215),.72)),this.hemi.groundColor.copy(t.clone().multiplyScalar(.55)),this.selectionRingMaterial.color.copy(this.palette.accent),this.traceRingMaterial.color.copy(this.palette.accent)}catColour(t){return this.palette.cats[t]??this.palette.accent}applyNodeColour(t){let e=t.colour;t.hollow?(t.material.color.copy(this.palette.surface),t.material.emissive.set(0),t.shellMaterial.color.copy(e)):(t.material.color.copy(e),t.material.emissive.copy(e).multiplyScalar(.16),t.shellMaterial.color.copy(e))}focusKey(){return this.emphasis.selectedId??this.hoveredId??(this.hoveredHub!==null?this.hubs.get(this.hoveredHub)?.id??null:null)}applyEdgeColour(t){if(this.pathEdgeKeys?.has(t.key)??!1){t.colour.copy(this.palette.accent);return}t.colour.copy(t.from.colour);let n=this.edgeTintOf(t);n>0&&t.colour.lerp(this.palette.accent,n)}edgeTintOf(t){let e=this.overlay?.edgeTint.get(`${t.edge.source}|${t.edge.target}`)??0;return Math.max(0,Math.min(1,e))}setWordsOverlay(t){this.overlay=t,this.syncHalos(),this.updateEmphasisSets()}syncHalos(){let t=this.overlay?.rings;for(let[e,n]of this.halos){let s=t?.get(e)??0;n.presence.target=s>0?1:0,s>0&&(n.value.target=s)}if(t)for(let[e,n]of t){if(n<=0||this.halos.has(e)||!this.nodeVisuals.has(e))continue;let s=new nn({color:this.palette.accent,transparent:!0,opacity:0,depthWrite:!1,side:Fe}),r=new ge(this.haloGeo,s);r.raycast=()=>{},r.visible=!1,this.haloGroup.add(r),this.halos.set(e,{mesh:r,material:s,presence:{current:0,target:1},value:{current:n,target:n}})}}clearHalos(){for(let t of this.halos.values())t.material.dispose();this.haloGroup.clear(),this.halos.clear()}setData(t){this.data=t;let e=new Map;for(let[h,d]of this.nodeVisuals)e.set(h,{x:d.sim.x,y:d.sim.y,z:d.sim.z});let n=new Map;for(let[h,d]of this.hubs)n.set(h,{lod:d.lod,lodTarget:d.lodTarget,lodFrom:d.lodFrom,lodStarted:d.lodStarted,dived:d.dived});let s=this.nodeVisuals.size===0,r=new Map;for(let h of t.nodes)r.set(h.group,(r.get(h.group)??0)+1);let o=new Map([...r.entries()].sort((h,d)=>d[1]-h[1]||h[0].localeCompare(d[0]))),a=pl(o,t.aspect,t.centralGroup);this.centres=a,!this.viewOwnedFlag&&a.size>2&&(this.view.theta=this.bestTheta(a),this.idleAnchor=this.view.theta,this.idlePhase=0);let l=h=>Go(t.measure,t.measure==="links"?t.degrees.get(h.id)??0:h.weight);this.sim=new Fs({nodes:t.nodes.map(h=>{let d=e.get(h.id);return{id:h.id,group:h.group,radius:l(h),...d?{x:d.x,y:d.y,z:d.z}:{}}}),links:t.edges.map(h=>({source:h.source,target:h.target})),layout:t.layout,centres:a}),this.sim.tick(300),this.clearScene(),t.nodes.forEach((h,d)=>{let u=this.sim?.byId(h.id);if(!u)return;let f=t.groupStyles.get(h.group),m=f?.slot??0,v=f?.hollow??!1,g=t.degrees.get(h.id)??0,p=t.measure==="links"&&g===0,A=l(h),w=new Wi({roughness:.42,metalness:.04,transparent:!0,opacity:1}),M=new ge(this.sphereGeo,w);M.userData.nodeId=h.id;let y=new nn({transparent:!0,opacity:v?.95:0,side:Ae,depthWrite:!1}),S=new ge(this.shellGeo,y);S.raycast=()=>{},M.add(S),S.scale.setScalar(v?1.22:1.14),this.nodeGroup.add(M);let C=document.createElement("div");C.className="rp-map3d-label",C.textContent=Ho(h.label),C.style.display="none",this.labelLayer.appendChild(C);let _={node:h,sim:u,pos:new N(u.x,u.y,u.z),r:p?Math.max(3.5,A-1.5):A,slot:m,colour:h.colour?new zt(h.colour):this.catColour(m).clone(),hollow:v,unlinked:p,mesh:M,material:w,shell:S,shellMaterial:y,opacity:{current:1,target:1},shellOpacity:{current:v?.95:0,target:v?.95:0},scale:{current:s&&!this.reduced?.001:1,target:1},lift:{current:0,target:0},degree:g,bornAt:s&&!this.reduced?performance.now()+Math.min(d*9,900):0,label:C,labelW:0,territory:null};this.applyNodeColour(_),this.nodeVisuals.set(h.id,_)});let c=Hg(t.edges);if(this.edgeVisuals=[],t.edges.forEach((h,d)=>{let u=this.nodeVisuals.get(h.source),f=this.nodeVisuals.get(h.target);if(!u||!f)return;let m=u.node.group!==f.node.group,v={edge:h,key:`${h.source}|${h.label}|${h.target}`,from:u,to:f,colour:u.colour.clone(),width:ph(h.weight),crossing:m,lateral:c[d]??0,opacity:{current:0,target:m?.08:.15},emphasised:!1,label:null,labelW:0,hub:null,aggregate:!1};this.applyEdgeColour(v),this.edgeVisuals.push(v)}),this.territories=[],t.layout==="grouped"&&o.size>1){let h=performance.now(),d=0;for(let[u]of o){let f=t.groupStyles.get(u);if(!f)continue;let m=[],v=0;for(let q of this.nodeVisuals.values())q.node.group===u&&(m.push(q),v+=q.node.total??0);let g=m.length,p=new nn({transparent:!0,opacity:.055,depthWrite:!1}),A=this.palette.cats[f.slot]??this.palette.accent;p.color.copy(A);let w=new ge(this.territoryGeo,p);w.raycast=()=>{},w.renderOrder=-2,this.territoryGroup.add(w);let M=document.createElement("div");M.className="rp-map3d-territory",M.style.color=this.palette.inks[f.slot]??"#5A616B";let y=`${u.toUpperCase()} \xB7 ${g}`;M.textContent=y,M.style.display="none",this.labelLayer.appendChild(M);let S={group:u,style:f,count:g,total:v,mesh:w,material:p,caption:M,captionFull:y,captionShort:u.toUpperCase(),captionW:0,captionShortW:0,captionHubW:0,captionShortHubW:0,centre:new N,r:0,spread:0,hub:null};for(let q of m)q.territory=S;if(this.territories.push(S),u===t.centralGroup||g<Fg)continue;let C=new Wi({roughness:.42,metalness:.04,transparent:!0,opacity:0});C.color.copy(A),C.emissive.copy(A).multiplyScalar(.16);let _=new ge(this.sphereGeo,C);_.raycast=()=>{},_.visible=!1;let E=new nn({color:new zt(f.ink),transparent:!0,opacity:0,depthWrite:!1,side:Fe}),R=new ge(this.haloGeo,E);R.raycast=()=>{},R.visible=!1,this.hubGroup.add(_,R);let I=n.get(u),L={id:`hub:${u}`,group:u,ink:f.ink,count:g,total:v,members:m,anchor:{node:{id:`hub:${u}`,group:u},pos:S.centre,r:Og(g),scale:{current:1,target:1},colour:A.clone()},mesh:_,material:C,ring:R,ringMaterial:E,flows:[],lod:I?.lod??0,lodTarget:I?.lodTarget??0,lodFrom:I?.lodFrom??0,lodStarted:I?.lodStarted??-1,dived:I?.dived??!1,opacity:{current:1,target:1},scale:{current:s&&!this.reduced?.001:1,target:1},bornAt:s&&!this.reduced?h+240+Math.min(d*45,600):0};d+=1,S.hub=L,this.hubs.set(u,L);let Y=new Map;for(let q of this.edgeVisuals){if(q.from.node.group!==u||q.to.node.group===u)continue;let O=q.edge,z=Y.get(O.target)??{total:0,weight:0,donors:0,firstYear:null,lastYear:null};z.total+=O.total??0,z.weight+=O.weight,z.donors+=1,O.firstYear&&(z.firstYear=z.firstYear===null?O.firstYear:Math.min(z.firstYear,O.firstYear)),O.lastYear&&(z.lastYear=z.lastYear===null?O.lastYear:Math.max(z.lastYear,O.lastYear)),Y.set(O.target,z)}for(let[q,O]of Y){let z=this.nodeVisuals.get(q);if(!z)continue;let k={source:L.id,target:q,label:Oe(O.total),weight:O.weight,total:O.total,count:O.donors,firstYear:O.firstYear,lastYear:O.lastYear,hub:u},$={edge:k,key:`${k.source}|${k.label}|${k.target}`,from:L.anchor,to:z,colour:L.anchor.colour.clone(),width:ph(O.weight),crossing:!0,lateral:0,opacity:{current:0,target:mh(O.weight)},emphasised:!1,label:null,labelW:0,hub:L,aggregate:!0};this.applyEdgeColour($),L.flows.push($),this.flowVisuals.push($)}}for(let u of this.edgeVisuals){let f=this.nodeVisuals.get(u.edge.source),m=this.nodeVisuals.get(u.edge.target);u.hub=f?.territory?.hub??m?.territory?.hub??null}}this.captionRank=[...this.territories].sort((h,d)=>d.count-h.count),this.paintRank=[...this.nodeVisuals.values()].sort((h,d)=>d.r-h.r),this.measureLabels(),this.updateWorldBounds(),this.updateTerritories(),this.syncHalos(),this.rebuildEdgeBuffers(),this.updateEmphasisSets(),this.renderDirty=!0}measureLabels(){this.measureCtx||(this.measureCtx=document.createElement("canvas").getContext("2d"));let t=this.measureCtx,e=c=>{if(!c)return{font:"",spacing:0};let h=getComputedStyle(c),d=parseFloat(h.letterSpacing);return{font:`${h.fontWeight} ${h.fontSize} ${h.fontFamily}`,spacing:Number.isFinite(d)?d:0}},n=this.paintRank[0],s=e(n?.label),r=this.territories[0]?.caption,o=e(r);r?.setAttribute("data-hub","");let a=e(r);r?.removeAttribute("data-hub"),this.labelFont=s.font,this.captionFont=o.font,this.captionSpacing=o.spacing;let l=(c,h,d,u)=>!t||!h?c.length*u:(t.font=h,t.measureText(c).width+d*c.length);for(let c of this.paintRank)c.labelW=l(c.label.textContent??"",this.labelFont,0,6.2);for(let c of this.territories)c.captionW=l(c.captionFull,this.captionFont,this.captionSpacing,7.4),c.captionShortW=l(c.captionShort,this.captionFont,this.captionSpacing,7.4),c.captionHubW=l(c.captionFull,a.font,a.spacing,8.2),c.captionShortHubW=l(c.captionShort,a.font,a.spacing,8.2)}clearScene(){this.clearHalos();for(let t of this.nodeVisuals.values())t.material.dispose(),t.shellMaterial.dispose(),t.label.remove();for(let t of this.edgeVisuals)t.label?.remove();for(let t of this.flowVisuals)t.label?.remove();for(let t of this.hubs.values())t.material.dispose(),t.ringMaterial.dispose();for(let t of this.territories)t.material.dispose(),t.caption.remove();this.nodeGroup.clear(),this.edgeGeometry.setDrawRange(0,0),this.territoryGroup.clear(),this.hubGroup.clear(),this.nodeVisuals.clear(),this.edgeVisuals=[],this.flowVisuals=[],this.territories=[],this.captionRank=[],this.hubs.clear(),this.hoveredHub=null}updateWorldBounds(){let t=new N,e=0;for(let s of this.nodeVisuals.values())t.x+=s.sim.x,t.y+=s.sim.y,t.z+=s.sim.z,e+=1;if(e===0)return;t.multiplyScalar(1/e);let n=120;for(let s of this.nodeVisuals.values()){let r=Math.hypot(s.sim.x-t.x,s.sim.y-t.y,s.sim.z-t.z)+s.r;r>n&&(n=r)}this.worldCentre.copy(t),this.worldRadius=n}setEmphasis(t){this.emphasis=t,this.updateEmphasisSets()}setHover(t,e){this.hoveredId===t&&this.hoveredHub===e||(this.hoveredId=t,this.hoveredHub=e,this.updatePopup(),this.canvas.style.cursor=t!==null||e!==null?"pointer":"grab",this.updateEmphasisSets())}setHovered(t){this.setHover(t,null)}setHoveredHub(t){this.setHover(null,t)}updateEmphasisSets(){let{selectedId:t,pathEdges:e,pathFrom:n}=this.emphasis,s=this.focusKey();if(s){let a=new Set([s]);for(let l of this.edgeVisuals)l.edge.source===s&&a.add(l.edge.target),l.edge.target===s&&a.add(l.edge.source);for(let l of this.flowVisuals)l.edge.source===s&&a.add(l.edge.target);this.neighbourIds=a}else this.neighbourIds=null;if(e){let a=new Set;for(let l of e)a.add(l.source),a.add(l.target);this.pathNodeIds=a,this.pathEdgeKeys=new Set(e.map(l=>`${l.source}|${l.label}|${l.target}`))}else this.pathNodeIds=null,this.pathEdgeKeys=null;for(let a of this.nodeVisuals.values()){let l=a.node.id,c=l===t,h=l===this.hoveredId,d=l===n,u=this.neighbourIds?.has(l)??!0,f=this.pathNodeIds?.has(l)??!1,m=this.pathNodeIds&&!f||!this.pathNodeIds&&!u,v=c||h||d||f;a.opacity.target=m?.3:a.unlinked&&!v?.6:1,a.shellOpacity.target=a.hollow?m?.2:.95:h&&!c?.4:0,a.scale.target=h&&!c?1.24:c?1.14:v?1.08:1,a.lift.target=h&&!c?1:0}let r=this.pathEdgeKeys,o=a=>{let l=r?.has(a.key)??!1,c=s!==null&&(a.edge.source===s||a.edge.target===s),h=r&&!l||s!==null&&!c&&!r,d=l||c;a.emphasised=d;let u=zg(a.edge.weight),f=a.aggregate?mh(a.edge.weight):(a.crossing?.055:.09)+.085*u,m=Math.max(f,.08+.28*this.edgeTintOf(a));a.opacity.target=h?.012+.008*u:d?.22+.16*u:m,this.applyEdgeColour(a)};for(let a of this.edgeVisuals)o(a);for(let a of this.flowVisuals)o(a);for(let a of this.hubs.values()){let l;if(r){let c=!1;for(let h of a.flows)r.has(h.key)&&(c=!0);l=!c}else if(s!==null&&a.id!==s){let c=!1;for(let h of a.flows)h.edge.target===s&&(c=!0);l=!c}else l=!1;a.opacity.target=l?.3:1,a.scale.target=a.group===this.hoveredHub?1.1:1}this.updatePopup(),this.renderDirty=!0}updatePopup(){let t=this.hoveredId?this.nodeVisuals.get(this.hoveredId):void 0,e=!t&&this.hoveredHub!==null?this.hubs.get(this.hoveredHub):void 0;if(!t&&!e||t&&t.node.id===this.emphasis.selectedId){this.popup.style.display="none";return}this.popupMeta.replaceChildren();let n=document.createElement("span");n.className="rp-map3d-popup-dot";let s=document.createElement("span");if(e){this.popupName.textContent=e.group.charAt(0).toUpperCase()+e.group.slice(1),n.style.background=`#${e.anchor.colour.getHexString()}`,s.textContent="industry cluster",s.style.color=e.ink;let r=e.flows.length;this.popupCounts.textContent=`${Oe(e.total)} \xB7 ${e.count} donors \xB7 ${r===1?"1 party":`${r} parties`}`,this.popupHint.textContent="Click to open the cluster"}else if(t){let r=t.node;this.popupName.textContent=r.label,n.style.background=`#${t.colour.getHexString()}`,s.textContent=r.kind==="party"?"political party":(r.industry??r.group).replace(/_/g," "),s.style.color=this.palette.inks[t.slot]??"#5A616B";let o=t.degree===1?"1":`${t.degree}`,a=r.kind==="party"?t.degree===1?"1 donor shown":`${o} donors shown`:t.degree===1?"1 party":`${o} parties`;this.popupCounts.textContent=r.total!==void 0?`${Oe(r.total)} \xB7 ${a}`:a,this.popupHint.textContent="Click for details"}this.popupMeta.append(n,s),this.labelLayer.appendChild(this.popup),this.popup.style.display="block",this.positionPopup()}positionPopup(){if(this.popup.style.display==="none")return;let t=this.hoveredId?this.nodeVisuals.get(this.hoveredId):void 0,e=!t&&this.hoveredHub!==null?this.hubs.get(this.hoveredHub):void 0,n=t??e?.anchor;if(!n){this.popup.style.display="none";return}if(this.labelVec.copy(n.pos).project(this.camera),this.labelVec.z>1||this.labelVec.z<-1){this.popup.style.display="none";return}let s=(this.labelVec.x*.5+.5)*this.width,r=(-this.labelVec.y*.5+.5)*this.height,o=n.pos.distanceTo(this.camera.position),a=Math.tan(Qn.degToRad(gi/2)),l=t?t.lift.current:0,c=n.r*n.scale.current*(this.height/2)/(o*a)*(1+l*.15),h=this.popup.offsetWidth,d=this.popup.offsetHeight,u=s+c+16;u+h>this.width-8&&(u=s-c-16-h);let f=Math.max(8,Math.min(this.height-d-8,r-d/2));this.popup.style.transform=`translate(${Math.max(8,u).toFixed(1)}px, ${f.toFixed(1)}px)`}setInsets(t){this.insets=t}get viewOwned(){return this.viewOwnedFlag}get focusOwned(){return this.focusOwnedFlag}claimView(){this.tween=null,this.viewOwnedFlag=!0,this.focusOwnedFlag=!1,this.idleSpin=!1}releaseDives(){for(let t of this.hubs.values())t.dived=!1}freeBox(){let t=Math.max(1,this.width-this.insets.left-this.insets.right),e=Math.max(1,this.height-this.insets.top-this.insets.bottom);return{w:t,h:e,cx:this.insets.left+t/2,cy:this.insets.top+e/2}}frameFor(t){let e=this.freeBox(),n=Qn.degToRad(gi/2),s=Math.max(.2,e.h/this.height),r=Math.max(.2,e.w/this.width),o=Math.atan(Math.tan(n)*s*.9),a=Math.atan(Math.tan(n)*this.camera.aspect*r*.9),l=t/Math.tan(Math.min(o,a));return{box:e,dist:l}}worldPerPixel(t){return 2*t*Math.tan(Qn.degToRad(gi/2))/this.height}offsetRight=new N;offsetUp=new N;offsetForward=new N;offsetOut=new N;offsetTarget(t,e){let n=this.freeBox(),s=this.worldPerPixel(e),r=n.cx-this.width/2,o=n.cy-this.height/2;return this.camera.matrixWorld.extractBasis(this.offsetRight,this.offsetUp,this.offsetForward),this.offsetOut.copy(t).addScaledVector(this.offsetRight,-r*s).addScaledVector(this.offsetUp,o*s)}fit(t=!0){if(this.tween=null,this.viewOwnedFlag=!1,this.focusOwnedFlag=!1,this.releaseDives(),this.nodeVisuals.size===0)return;this.updateWorldBounds(),this.updateCamera();let e=this.fitDistance();this.fitDist=e;let s={target:this.offsetTarget(this.fitCentre,e).clone(),theta:this.view.theta,phi:this.view.phi,dist:e};this.moveView(s,t?Cg:0)}bestTheta(t){let e=this.view.phi,n=[...t.values()],s=this.view.theta,r=-1/0;for(let o=0;o<36;o++){let a=o/36*Math.PI*2,l=Math.cos(a),c=-Math.sin(a),h=Math.cos(e),d=1/0;for(let u=0;u<n.length;u++)for(let f=u+1;f<n.length;f++){let m=n[u],v=n[f];if(!m||!v)continue;let g=(m.x-v.x)*l+(m.z-v.z)*c,p=(m.y-v.y)*Math.sin(e)-((m.x-v.x)*-c+(m.z-v.z)*l)*h,A=Math.hypot(g,p)/(m.r+v.r);A<d&&(d=A)}d>r&&(r=d,s=a)}return s}fitCentre=new N;fitMidR=0;fitMidU=0;fitDistance(){let{theta:t,phi:e}=this.view;return this.fitCentre.copy(this.worldCentre),this.fitDistanceAt(t,e,!0),this.fitCentre.addScaledVector(this.fitVecRight,this.fitMidR).addScaledVector(this.fitVecUp,this.fitMidU),this.fitDistanceAt(t,e,!1)}fitVecE=new N;fitVecRight=new N;fitVecUp=new N;fitVecD=new N;fitDistanceAt(t,e,n){let s=this.fitVecE.set(Math.sin(e)*Math.sin(t),Math.cos(e),Math.sin(e)*Math.cos(t)),r=this.fitVecRight.crossVectors(this.edgeUp,s);r.lengthSq()<.001&&r.set(1,0,0),r.normalize();let o=this.fitVecUp.crossVectors(s,r),a=this.freeBox(),l=Qn.degToRad(gi/2),c=Math.tan(l)*this.camera.aspect*Math.max(.2,a.w/this.width)*.92,h=Math.tan(l)*Math.max(.2,a.h/this.height)*.92,d=2*Math.tan(l)/this.height,u=this.fitCentre,f=this.fitVecD,m=240,v=-1/0,g=-1/0,p=-1/0,A=-1/0;for(let y of this.nodeVisuals.values()){f.set(y.sim.x,y.sim.y,y.sim.z).sub(u);let S=f.dot(s),C=f.dot(r),_=f.dot(o),E=Math.abs(C)+y.r,R=Math.max(_+y.r+26,-_+y.r);if(m=Math.max(m,E/c+S,R/h+S),n){let I=c*S,L=h*S;C+y.r+I>v&&(v=C+y.r+I),-C+y.r+I>g&&(g=-C+y.r+I),_+y.r+26+L>p&&(p=_+y.r+26+L),-_+y.r+L>A&&(A=-_+y.r+L)}}let w=ml+5+an,M=w*d/h;for(let y of this.territories){f.copy(y.centre).sub(u);let S=f.dot(s),_=(Math.max(y.captionW,y.captionHubW)/2+4+an)*d/c;_<.9&&(m=Math.max(m,(Math.abs(f.dot(r))/c+S)/(1-_)));let E=f.dot(o)+y.r;M<.9&&E>0&&(m=Math.max(m,(E/h+S)/(1-M)))}if(n){for(let y of this.territories){f.copy(y.centre).sub(u);let S=f.dot(s),C=f.dot(r),_=f.dot(o),E=(Math.max(y.captionW,y.captionHubW)/2+4+an)*d*m,R=c*S;C+E+R>v&&(v=C+E+R),-C+E+R>g&&(g=-C+E+R);let I=_+y.r+w*d*m+h*S;I>p&&(p=I)}this.fitMidR=Number.isFinite(v)&&Number.isFinite(g)?(v-g)/2:0,this.fitMidU=Number.isFinite(p)&&Number.isFinite(A)?(p-A)/2:0}return m}focusOn(t,e){let n=this.nodeVisuals.get(t);if(!n)return null;this.updateCamera();let s=new N(n.sim.x,n.sim.y,n.sim.z),r=this.freeBox(),o=s.clone().project(this.camera),a=(o.x*.5+.5)*this.width,l=(-o.y*.5+.5)*this.height,c=Math.min(90,r.w*.18),h=Math.min(90,r.h*.18),d=o.z<1&&a>this.insets.left+c&&a<this.insets.left+r.w-c&&l>this.insets.top+h&&l<this.insets.top+r.h-h,u=n.territory?.hub?.lodTarget===1;if(d&&this.insets.bottom<=0&&!u)return null;let f=e;if(f===null){let v=n.r+30,g=0;for(let y of this.edgeVisuals){let S=y.edge.source===t?y.edge.target:y.edge.target===t?y.edge.source:null;if(S===null)continue;let C=this.nodeVisuals.get(S);if(!C)continue;g++;let _=Math.hypot(C.sim.x-n.sim.x,C.sim.y-n.sim.y,C.sim.z-n.sim.z)+C.r;_>v&&(v=_)}let{dist:p}=this.frameFor(v*1.12),A=g>=40,w=A?uh*(1+Math.log10(g/20)):uh,M=Math.max(Rg,Math.min(w,p));f=A?M:Math.min(this.view.dist,M)}f=Math.max(this.minDist(),Math.min(this.maxDist(),f));let m=this.offsetTarget(s,f);return this.moveView({target:m,theta:this.view.theta,phi:this.view.phi,dist:f},hh),this.viewOwnedFlag=!0,this.focusOwnedFlag=!0,this.idleSpin=!1,f}nudgeForInsets(t,e){if(t===0&&e===0)return;let n=this.worldPerPixel(this.view.dist),s=new N,r=new N,o=new N;this.camera.matrixWorld.extractBasis(s,r,o);let a=this.view.target.clone().addScaledVector(s,-t*n).addScaledVector(r,e*n);this.moveView({...this.view,target:a},hh)}zoomBy(t){this.claimView(),this.releaseDives(),this.distGoal=Math.max(this.minDist(),Math.min(this.maxDist(),this.distGoal/t))}minDist(){return Math.max(60,this.fitDist*Tg)}maxDist(){return this.fitDist*Ag}moveView(t,e){if(this.reduced||e<=0){this.view={...t,target:t.target.clone()},this.distGoal=t.dist,this.tween=null,this.renderDirty=!0;return}this.tween={from:{...this.view,target:this.view.target.clone()},to:{...t,target:t.target.clone()},started:performance.now(),duration:e},this.distGoal=t.dist}bindPointerHandlers(){let t=this.canvas;t.addEventListener("pointerdown",this.onPointerDown),t.addEventListener("pointermove",this.onPointerMove),t.addEventListener("pointerup",this.onPointerUp),t.addEventListener("pointercancel",this.onPointerUp),t.addEventListener("pointerleave",this.onPointerLeave),t.addEventListener("wheel",this.onWheel,{passive:!1}),t.addEventListener("contextmenu",this.onContextMenu),t.addEventListener("keydown",this.onKeyDown)}unbindPointerHandlers(){let t=this.canvas;t.removeEventListener("pointerdown",this.onPointerDown),t.removeEventListener("pointermove",this.onPointerMove),t.removeEventListener("pointerup",this.onPointerUp),t.removeEventListener("pointercancel",this.onPointerUp),t.removeEventListener("pointerleave",this.onPointerLeave),t.removeEventListener("wheel",this.onWheel),t.removeEventListener("contextmenu",this.onContextMenu),t.removeEventListener("keydown",this.onKeyDown)}localPoint(t){let e=this.canvas.getBoundingClientRect();return{x:t.clientX-e.left,y:t.clientY-e.top}}capturePointer(t){try{this.canvas.setPointerCapture?.(t)}catch{}}releasePointer(t){try{this.canvas.releasePointerCapture?.(t)}catch{}}raycastVec=new N;pickedNode=null;pickedHub=null;pick(t,e){this.updateCamera(),this.raycaster.setFromCamera(new Jt(t/this.width*2-1,-(e/this.height)*2+1),this.camera);let n=this.raycaster.ray.origin,s=this.raycaster.ray.direction,r=this.raycastVec,o=null,a=null,l=1/0,c=(h,d)=>{r.copy(h).sub(n);let u=r.dot(s);if(u<0)return null;let f=r.lengthSq()-u*u;if(f>d*d)return null;let m=u-Math.sqrt(d*d-f);return m<this.camera.near||m>=l?null:m};for(let h of this.nodeVisuals.values()){let d=h.territory?.hub;if(d&&d.lod>=.5)continue;let u=c(h.pos,h.r);u!==null&&(o=h,a=null,l=u)}for(let h of this.hubs.values()){if(h.lod<.5)continue;let d=c(h.anchor.pos,h.anchor.r*h.anchor.scale.current);d!==null&&(a=h,o=null,l=d)}this.pickedNode=o,this.pickedHub=a}raycastNode(t,e){return this.pick(t,e),this.pickedNode}edgeFold(t){let e=t.hub;return e?t.aggregate?e.lod:1-e.lod:1}pickVecA=new N;pickVecB=new N;pickEdge(t,e,n=9){this.updateCamera();let s=null,r=n,o=this.pickVecA,a=this.pickVecB,l=c=>{if(Math.max(c.opacity.current,c.opacity.target)<.05||this.edgeFold(c)<.5||(o.copy(c.from.pos).project(this.camera),a.copy(c.to.pos).project(this.camera),o.z>1&&a.z>1||o.z<-1&&a.z<-1))return;let h=(o.x*.5+.5)*this.width,d=(-o.y*.5+.5)*this.height,u=(a.x*.5+.5)*this.width,f=(-a.y*.5+.5)*this.height,m=u-h,v=f-d,g=m*m+v*v,p=g>0?Math.max(0,Math.min(1,((t-h)*m+(e-d)*v)/g)):0,A=Math.hypot(t-(h+p*m),e-(d+p*v));A<r&&(r=A,s=c)};for(let c of this.edgeVisuals)l(c);for(let c of this.flowVisuals)l(c);return s}onPointerDown=t=>{let e=this.localPoint(t);if(this.pointers.set(t.pointerId,e),this.capturePointer(t.pointerId),this.pointers.size===2){this.orbit=null,this.releaseDrag();let[s,r]=[...this.pointers.entries()];s&&r&&(this.claimView(),this.releaseDives(),this.pinch={a:s[0],b:r[0],gap:Math.hypot(s[1].x-r[1].x,s[1].y-r[1].y),dist:this.view.dist,midX:(s[1].x+r[1].x)/2,midY:(s[1].y+r[1].y)/2});return}if(this.pointers.size>2||this.pinch)return;this.setHovered(null),t.button===0?this.pick(e.x,e.y):(this.pickedNode=null,this.pickedHub=null);let n=this.pickedNode;if(n&&this.sim){let s=new N;this.camera.getWorldDirection(s);let r=new N(n.sim.x,n.sim.y,n.sim.z),o=new Ze().setFromNormalAndCoplanarPoint(s,r);this.drag={id:n.node.id,plane:o,moved:!1,lastX:e.x,lastY:e.y,travel:0},this.idleSpin=!1,this.sim.reheat();return}this.orbit={mode:t.button===2||t.button===1||t.shiftKey?"pan":"orbit",lastX:e.x,lastY:e.y,moved:0,hub:this.pickedHub?this.pickedHub.group:null},this.canvas.style.cursor="grabbing"};onPointerMove=t=>{let e=this.localPoint(t);this.pointers.has(t.pointerId)&&this.pointers.set(t.pointerId,e);let n=this.pinch;if(n){let o=this.pointers.get(n.a),a=this.pointers.get(n.b);if(!o||!a)return;let l=Math.hypot(o.x-a.x,o.y-a.y);if(l>0&&n.gap>0){let d=Math.max(this.minDist(),Math.min(this.maxDist(),n.dist*(n.gap/l)));this.view.dist=d,this.distGoal=d}let c=(o.x+a.x)/2,h=(o.y+a.y)/2;this.panBy(c-n.midX,h-n.midY),n.midX=c,n.midY=h,this.renderDirty=!0;return}let s=this.drag;if(s&&this.sim){if(s.travel+=Math.abs(e.x-s.lastX)+Math.abs(e.y-s.lastY),s.lastX=e.x,s.lastY=e.y,s.travel<=3)return;s.moved=!0,this.raycaster.setFromCamera(new Jt(e.x/this.width*2-1,-(e.y/this.height)*2+1),this.camera);let o=new N;this.raycaster.ray.intersectPlane(s.plane,o)&&this.sim.pin(s.id,o.x,o.y,o.z);return}let r=this.orbit;if(r){let o=e.x-r.lastX,a=e.y-r.lastY;r.moved+=Math.abs(o)+Math.abs(a),r.lastX=e.x,r.lastY=e.y,r.moved>3&&this.claimView(),r.mode==="pan"?this.panBy(o,a):(this.view.theta-=o*.005,this.view.phi=Math.max(dh,Math.min(fh,this.view.phi-a*.005))),this.renderDirty=!0;return}this.hoverPos=e,this.hoverDirty=!0};panBy(t,e){let n=this.worldPerPixel(this.view.dist),s=new N,r=new N,o=new N;this.camera.matrixWorld.extractBasis(s,r,o),this.view.target.addScaledVector(s,-t*n).addScaledVector(r,e*n)}releaseDrag(){let t=this.drag;t&&(this.sim?.unpin(t.id),this.sim?.cool(),this.drag=null)}onPointerUp=t=>{let e=this.localPoint(t);if(this.pointers.delete(t.pointerId),this.releasePointer(t.pointerId),this.pinch){this.pointers.size<2&&(this.pinch=null,this.gestured=!0);return}let n=this.drag;if(n){let r=n.moved;this.releaseDrag(),r||this.onSelect(n.id);return}let s=this.orbit;if(this.orbit=null,this.canvas.style.cursor="grab",s&&s.moved<=3){if(this.gestured){this.gestured=!1;return}if(s.hub!==null){this.diveInto(s.hub);return}let r=this.raycastNode(e.x,e.y);if(r)this.onSelect(r.node.id);else if(this.pickedHub)this.diveInto(this.pickedHub.group);else{let o=this.onEdgePick?this.pickEdge(e.x,e.y):null;o?this.onEdgePick?.(o.edge):this.emphasis.selectedId===null&&this.emphasis.pathEdges===null&&this.view.dist<this.fitDist*.9?this.fit(!0):this.onSelect(null)}}this.gestured=!1};onPointerLeave=()=>{this.hoverPos=null,this.setHovered(null)};onWheel=t=>{t.preventDefault(),this.claimView(),this.releaseDives();let e=t.deltaY<0?1.12:1/1.12;this.distGoal=Math.max(this.minDist(),Math.min(this.maxDist(),this.distGoal/e))};onContextMenu=t=>{t.preventDefault()};centremost(){let t=this.freeBox(),e=1/0,n=this.labelVec;this.pickedNode=null,this.pickedHub=null;let s=r=>{if(n.copy(r).project(this.camera),n.z>1||n.z<-1)return!1;let o=(n.x*.5+.5)*this.width,a=(-n.y*.5+.5)*this.height;if(o<0||o>this.width||a<0||a>this.height)return!1;let l=Math.hypot(o-t.cx,a-t.cy);return l>=e?!1:(e=l,!0)};for(let r of this.nodeVisuals.values()){let o=r.territory?.hub;o&&o.lod>=.5||s(r.pos)&&(this.pickedNode=r,this.pickedHub=null)}for(let r of this.hubs.values())r.lod<.5||s(r.anchor.pos)&&(this.pickedHub=r,this.pickedNode=null)}onKeyDown=t=>{switch(t.key){case"Enter":case" ":{this.centremost(),this.pickedHub?this.diveInto(this.pickedHub.group):this.pickedNode&&this.onSelect(this.pickedNode.node.id);break}case"ArrowLeft":this.claimView(),this.view.theta+=.15;break;case"ArrowRight":this.claimView(),this.view.theta-=.15;break;case"ArrowUp":this.claimView(),this.view.phi=Math.max(dh,this.view.phi-.15);break;case"ArrowDown":this.claimView(),this.view.phi=Math.min(fh,this.view.phi+.15);break;case"+":case"=":this.zoomBy(1.3);break;case"-":this.zoomBy(1/1.3);break;default:return}t.preventDefault(),this.renderDirty=!0};handleResize(){let t=this.canvas.parentElement;if(!t)return;let e=t.getBoundingClientRect();e.width<1||e.height<1||(this.width=e.width,this.height=e.height,this.renderer.setSize(e.width,e.height,!1),this.camera.aspect=e.width/e.height,this.camera.updateProjectionMatrix(),!this.viewOwnedFlag&&this.nodeVisuals.size>0&&this.fit(!1),this.renderDirty=!0)}stepFades(t){let e=this.reduced?1:1-Math.exp(-t/110),n=!1,s=o=>{let a=o.target-o.current;return Math.abs(a)<.004?(o.current=o.target,o.current):(n=!0,o.current+=a*e,o.current)},r=performance.now();for(let o of this.nodeVisuals.values())o.bornAt>0&&r<o.bornAt?n=!0:(o.bornAt=0,s(o.scale)),s(o.opacity),s(o.shellOpacity),s(o.lift);for(let o of this.edgeVisuals)s(o.opacity);for(let o of this.flowVisuals)s(o.opacity);for(let o of this.hubs.values())o.bornAt>0&&r<o.bornAt?n=!0:(o.bornAt=0,s(o.scale)),s(o.opacity);for(let o of this.halos.values())s(o.presence),s(o.value);return n}frame=t=>{if(this.disposed||this.paused)return;this.frameHandle=requestAnimationFrame(this.frame);let e=Math.min(64,t-this.lastFrame);this.lastFrame=t,this.frameCount+=1;let n=this.sim!==null&&(this.sim.alpha()>.02||this.drag!==null);n&&(this.sim?.tick(1),this.renderDirty=!0);let s=this.tween;if(s){let o=Math.min(1,(t-s.started)/s.duration),a=1-Math.pow(1-o,3);this.view.target.lerpVectors(s.from.target,s.to.target,a),this.view.theta=s.from.theta+(s.to.theta-s.from.theta)*a,this.view.phi=s.from.phi+(s.to.phi-s.from.phi)*a,this.view.dist=s.from.dist*Math.pow(s.to.dist/s.from.dist,a),o>=1&&(this.tween=null),this.renderDirty=!0}else{let o=this.distGoal-this.view.dist;if(Math.abs(o)>.5&&(this.view.dist+=o*(this.reduced?1:Math.min(1,e/90)),this.renderDirty=!0),this.idleSpin&&this.nodeVisuals.size>0){if(this.idlePhase+=e/1e3,this.view.theta=this.idleAnchor+Ig*Math.sin(this.idlePhase/Pg*Math.PI*2),!this.viewOwnedFlag){this.updateCamera();let a=this.fitDistance();this.fitDist=a,this.view.dist=a,this.distGoal=a,this.view.target.copy(this.offsetTarget(this.fitCentre,a))}this.renderDirty=!0}}this.stepFades(e)&&(this.renderDirty=!0);let r=this.updateLod(t);r&&(this.renderDirty=!0),(this.hoverDirty||r)&&!this.drag&&!this.orbit&&!this.pinch&&(this.hoverDirty=!1,this.hoverPos&&(this.pick(this.hoverPos.x,this.hoverPos.y),this.setHover(this.pickedNode?this.pickedNode.node.id:null,this.pickedHub?this.pickedHub.group:null))),!this.reduced&&this.edgeVisuals.length+this.flowVisuals.length>0&&t-this.lastFlowPaint>=42&&(this.lastFlowPaint=t,this.edgeUniforms.uPhase.value=t%7e3/7e3,this.renderDirty=!0),this.renderDirty&&(this.renderDirty=!1,this.updateCamera(),n&&this.updateTerritories(),this.updateNodeMeshes(),this.updateHubMeshes(),this.updateEdgeMeshes(),this.updateRings(),this.renderer.render(this.scene,this.camera),this.projectLabels(),(n||this.tween||r)&&(this.renderDirty=!0))};updateCamera(){let{target:t,theta:e,phi:n,dist:s}=this.view,r=Math.sin(n);this.camera.position.set(t.x+s*r*Math.sin(e),t.y+s*Math.cos(n),t.z+s*r*Math.cos(e)),this.camera.lookAt(t),this.camera.updateMatrixWorld(),this.fog.near=s+this.worldRadius*.35,this.fog.far=s+this.worldRadius*4.4}nodeLiftDir=new N;updateNodeMeshes(){for(let t of this.nodeVisuals.values()){let e=t.territory?.hub??null,n=e?e.lod:0,s=t.pos;s.set(t.sim.x,t.sim.y,t.sim.z),e&&n>0&&s.lerp(e.anchor.pos,n);let r=1-n,o=Math.max(.001,t.r*t.scale.current*(.55+.45*r));t.mesh.position.copy(s),t.lift.current>.001&&(this.nodeLiftDir.copy(this.camera.position).sub(t.mesh.position).normalize(),t.mesh.position.addScaledVector(this.nodeLiftDir,t.lift.current*(t.r*.6+10))),t.mesh.scale.setScalar(o);let a=t.opacity.current*r*r;t.mesh.visible=a>.005,t.material.opacity=a,t.material.depthWrite=a>.5,t.shellMaterial.opacity=t.shellOpacity.current*r,t.shell.visible=t.shellMaterial.opacity>.01}}updateHubMeshes(){for(let t of this.territories){let e=t.hub;if(!e)continue;let n=e.lod;t.material.opacity=.055*(1-n),t.mesh.visible=n<.98;let s=.55+.45*n,r=e.scale.current*s;if(e.anchor.scale.current=r,n<=.001){e.mesh.visible=!1,e.ring.visible=!1;continue}let o=Math.max(.001,e.anchor.r*r),a=e.opacity.current*n;e.mesh.visible=a>.005,e.mesh.position.copy(e.anchor.pos),e.mesh.scale.setScalar(o),e.material.opacity=a,e.material.depthWrite=a>.5;let l=Math.max(0,(n-.25)/.75);e.ring.visible=l>.01,e.ring.position.copy(e.anchor.pos),e.ring.scale.setScalar(o*1.24),e.ring.quaternion.copy(this.camera.quaternion),e.ringMaterial.opacity=.75*e.opacity.current*l}}edgeUp=new N(0,1,0);edgeTmpDir=new N;edgeTmpSide=new N;edgeTmpMid=new N;edgeTmpView=new N;edgeTmpStart=new N;edgeTmpEnd=new N;edgeTmpTip=new N;rebuildEdgeBuffers(){let t=this.edgeVisuals.length+this.flowVisuals.length,e=t*7;this.edgePositions=new Float32Array(e*3),this.edgeColours=new Float32Array(e*4),this.edgeTimes=new Float32Array(e),this.edgeSeeds=new Float32Array(e),this.edgeKinds=new Float32Array(e);let n=e>65535?Uint32Array:Uint16Array,s=new n(t*9);for(let o=0;o<t;o+=1){let a=o*7,l=o*9;s.set([a,a+1,a+2,a+2,a+1,a+3,a+4,a+5,a+6],l);let c=o*.61803398875%1;for(let h=0;h<7;h+=1)this.edgeSeeds[a+h]=c;this.edgeTimes.set([0,0,.9,.9,1,.88,.88],a),this.edgeKinds.set([0,0,0,0,1,1,1],a)}let r=(o,a)=>new ye(o,a).setUsage(Ga);this.edgeGeometry.setAttribute("position",r(this.edgePositions,3)),this.edgeGeometry.setAttribute("flowColor",r(this.edgeColours,4)),this.edgeGeometry.setAttribute("flowT",new ye(this.edgeTimes,1)),this.edgeGeometry.setAttribute("flowSeed",new ye(this.edgeSeeds,1)),this.edgeGeometry.setAttribute("flowKind",new ye(this.edgeKinds,1)),this.edgeGeometry.setIndex(new ye(s,1)),this.edgeGeometry.setDrawRange(0,s.length)}updateEdgeMeshes(){let t=0;for(let s of this.edgeVisuals)this.layoutEdge(s,t++);for(let s of this.flowVisuals)this.layoutEdge(s,t++);let e=this.edgeGeometry.getAttribute("position"),n=this.edgeGeometry.getAttribute("flowColor");e&&(e.needsUpdate=!0),n&&(n.needsUpdate=!0)}layoutEdge(t,e){let n=this.edgeTmpDir,s=this.edgeTmpSide,r=this.edgeTmpMid,o=this.edgeTmpView,a=this.edgeTmpStart,l=this.edgeTmpEnd,c=this.edgeTmpTip,{from:h,to:d}=t,u=this.edgeFold(t),f=t.opacity.current*u;n.copy(d.pos).sub(h.pos);let m=n.length(),v=e*7,g=v*4;if(m<1||f<=.002){for(let R=0;R<7;R+=1)this.edgeColours[g+R*4+3]=0;return}n.multiplyScalar(1/m);let p=h.r*h.scale.current,A=d.r*d.scale.current,w=t.emphasised?Math.max(t.width,.72):t.width,M=Math.max(3.2,w*3.4),y=Math.max(1.25,w*1.8);r.copy(h.pos).add(d.pos).multiplyScalar(.5),o.copy(this.camera.position).sub(r),s.crossVectors(n,o),s.lengthSq()<.01&&s.set(1,0,0),s.normalize();let S=t.lateral*Math.min(12,m*.1);c.copy(d.pos).addScaledVector(n,-(A+1)).addScaledVector(s,S),l.copy(c).addScaledVector(n,-M),a.copy(h.pos).addScaledVector(n,p+1).addScaledVector(s,S),a.distanceToSquared(l)<1&&a.copy(l).addScaledVector(n,-1);let C=this.edgePositions,_=(R,I,L)=>{let Y=(v+R)*3;C[Y]=I.x+s.x*L,C[Y+1]=I.y+s.y*L,C[Y+2]=I.z+s.z*L};_(0,a,w),_(1,a,-w),_(2,l,w),_(3,l,-w),_(4,c,0),_(5,l,y),_(6,l,-y);let E=this.edgeColours;for(let R=0;R<7;R+=1){let I=g+R*4;E[I]=t.colour.r,E[I+1]=t.colour.g,E[I+2]=t.colour.b,E[I+3]=f}}updateTerritories(){for(let t of this.territories){let e=0,n=0,s=0,r=0;for(let a of this.nodeVisuals.values())a.node.group===t.group&&(e+=a.sim.x,n+=a.sim.y,s+=a.sim.z,r+=1);if(r===0){t.mesh.visible=!1,t.caption.style.display="none";continue}e/=r,n/=r,s/=r;let o=0;for(let a of this.nodeVisuals.values()){if(a.node.group!==t.group)continue;let l=Math.hypot(a.sim.x-e,a.sim.y-n,a.sim.z-s)+a.r;l>o&&(o=l)}t.centre.set(e,n,s),t.spread=o,t.r=o+22,t.mesh.visible=!0,t.mesh.position.set(e,n,s),t.mesh.scale.setScalar(t.r)}}setLod(t,e,n){t.lodTarget===e&&t.lodStarted>=0||(t.lodTarget=e,t.lodFrom=t.lod,t.lodStarted=n,this.renderDirty=!0)}goalDist(){return this.tween?this.tween.to.dist:this.distGoal}updateLod(t){if(this.hubs.size===0)return!1;this.updateCamera();let e=Math.tan(Qn.degToRad(gi/2)),n=Math.max(1,this.goalDist()),s=this.pinnedGroups(),r=!1;for(let o of this.territories){let a=o.hub;if(!a)continue;let l=s!==null&&s.has(a.group),c=o.spread*(this.height/2)/(n*e),h=a.lodTarget;if(l||a.lodTarget===1&&c>Dg?h=0:a.lodTarget===0&&c<Lg&&!a.dived&&(h=1),a.lodStarted<0){a.lodTarget=h,a.lod=h,a.lodFrom=h,a.lodStarted=t,this.renderDirty=!0;continue}if(h!==a.lodTarget&&this.setLod(a,h,t),a.lod!==a.lodTarget){if(this.reduced)a.lod=a.lodTarget;else{let d=Math.min(1,(t-a.lodStarted)/Ng);a.lod=a.lodFrom+(a.lodTarget-a.lodFrom)*Bg(d),d>=1&&(a.lod=a.lodTarget)}r=!0}}return r}pinnedGroups(){let{selectedId:t,pathEdges:e,pathFrom:n}=this.emphasis;if(t===null&&e===null&&n===null)return null;let s=new Set,r=o=>{if(o===null)return;let a=this.nodeVisuals.get(o);a&&s.add(a.node.group)};if(r(t),r(n),e)for(let o of e)r(o.source),r(o.target);return s}diveInto(t){let e=this.territories.find(a=>a.group===t),n=e?.hub;if(!e||!n)return;this.updateCamera();let{dist:s}=this.frameFor(e.spread*1.55+40),r=Math.max(this.minDist(),Math.min(this.maxDist(),s)),o=this.offsetTarget(e.centre,r);this.moveView({target:o,theta:this.view.theta,phi:this.view.phi,dist:r},Ug),n.dived=!0,this.setLod(n,0,performance.now()),this.viewOwnedFlag=!0,this.focusOwnedFlag=!0,this.idleSpin=!1,this.setHoveredHub(null)}get folded(){let t=new Map;for(let[e,n]of this.hubs)t.set(e,n.lodTarget===1);return t}updateRings(){let t=(e,n,s)=>{let r=s?this.nodeVisuals.get(s):void 0;if(!r){e.visible=!1;return}e.visible=!0,e.position.copy(r.pos),e.scale.setScalar(r.r*r.scale.current),e.quaternion.copy(this.camera.quaternion),n.opacity=.85};t(this.selectionRing,this.selectionRingMaterial,this.emphasis.selectedId),t(this.traceRing,this.traceRingMaterial,this.emphasis.pathFrom!==this.emphasis.selectedId?this.emphasis.pathFrom:null);for(let[e,n]of this.halos){let s=this.nodeVisuals.get(e),r=n.presence.current;if(!s||r<.01){n.mesh.visible=!1;continue}let o=Math.max(0,Math.min(1,n.value.current));n.mesh.visible=!0,n.mesh.position.copy(s.mesh.position),n.mesh.scale.setScalar(s.r*s.scale.current*(1.42+.5*o)),n.mesh.quaternion.copy(this.camera.quaternion),n.material.opacity=r*(.18+.72*o)*s.opacity.current}}labelVec=new N;probeBox={x1:0,y1:0,x2:0,y2:0};placeBox(t,e,n,s,r=!1){let o=this.placedLabelBoxes;if(!r){for(let l of o)if(t<l.x2&&n>l.x1&&e<l.y2&&s>l.y1)return!1}let a=this.boxPool[o.length];return a?(a.x1=t,a.y1=e,a.x2=n,a.y2=s):(a={x1:t,y1:e,x2:n,y2:s},this.boxPool.push(a)),o.push(a),!0}capText="";capBaseline=0;capX=0;placeCaption(t,e,n,s,r){let o=e/2+4,a=this.insets.left+an,l=this.width-this.insets.right-an,c=this.insets.top+an,h=this.height-this.insets.bottom-an;if(o*2>l-a)return!1;for(let d=0;d<2;d++)for(let u=0;u<2;u++){let f=u===0?s-r-5-ml:s+r+5,m=f+ml;if(f<c||m>h)continue;let v=n-o,g=n+o;if(v<a||g>l){if(d===0)continue;let p=v<a?a-v:l-g;v+=p,g+=p}if(this.placeBox(v,f,g,m))return this.capText=t,this.capBaseline=m,this.capX=(v+g)/2,!0}return!1}discCount=0;pushDisc(t,e,n,s){let r=this.discs[this.discCount];return r||(r={ok:!1,sx:0,sy:0,camDist:0,screenR:0,opacity:0},this.discs.push(r)),this.discCount+=1,this.labelVec.copy(t).project(this.camera),r.ok=this.labelVec.z<=1&&this.labelVec.z>=-1,r.sx=(this.labelVec.x*.5+.5)*this.width,r.sy=(-this.labelVec.y*.5+.5)*this.height,r.camDist=t.distanceTo(this.camera.position),r.screenR=e*(this.height/2)/(Math.max(1,r.camDist)*s),r.opacity=n,r}projectLabels(){let t=this.camera,e=Math.tan(Qn.degToRad(gi/2)),n=this.focusKey(),{selectedId:s,pathFrom:r}=this.emphasis;this.placedLabelBoxes.length=0,this.discCount=0;for(let f of this.paintRank)this.pushDisc(f.pos,f.r*f.scale.current*(1+f.lift.current*.15),f.material.opacity,e);let o=this.discCount;for(let f of this.hubs.values())f.lod>.5&&this.pushDisc(f.anchor.pos,f.anchor.r*f.anchor.scale.current,f.material.opacity,e);let a=this.discs,l=this.discCount,c=f=>f===n||f===this.hoveredId||f===r||(this.pathNodeIds?.has(f)??!1),h=(f,m,v,g)=>{let p=f.label;p.style.display="block",p.style.transform=`translate(-50%, -100%) translate(${m.toFixed(1)}px, ${v.toFixed(1)}px)`,p.style.opacity=g.toFixed(2)};for(let f=0;f<this.paintRank.length;f++){let m=this.paintRank[f],v=a[f];if(!m||!v)continue;let g=m.node.id;if(!c(g))continue;let p=m.label;if(!v.ok){p.style.display="none";continue}let{sx:A,sy:w,screenR:M}=v,y=m.labelW*(g===s?1.2:1.1)/2+4;this.placeBox(A-y,w-M-25,A+y,w-M-3,!0),h(m,A,w-M-4,1),p.setAttribute("data-emphasised",""),g===s?p.setAttribute("data-selected",""):p.removeAttribute("data-selected")}for(let f of this.captionRank){let m=f.caption,v=f.hub,g=v?v.lod:0;if(this.labelVec.copy(f.centre).project(t),this.labelVec.z>1||this.labelVec.z<-1){m.style.display="none";continue}let p=(this.labelVec.x*.5+.5)*this.width,A=(-this.labelVec.y*.5+.5)*this.height;if(p<-60||p>this.width+60||A<-40||A>this.height+40){m.style.display="none";continue}let w=f.centre.distanceTo(t.position),y=(v?f.r+(v.anchor.r*v.anchor.scale.current*1.3-f.r)*g:f.r)*(this.height/2)/(Math.max(1,w)*e),S=g>.5;if(!this.placeCaption(f.captionFull,S?f.captionHubW:f.captionW,p,A,y)&&!this.placeCaption(f.captionShort,S?f.captionShortHubW:f.captionShortW,p,A,y)){m.style.display="none";continue}m.textContent!==this.capText&&(m.textContent=this.capText),m.style.display="block",m.style.transform=`translate(-50%, -100%) translate(${this.capX.toFixed(1)}px, ${this.capBaseline.toFixed(1)}px)`;let C=S?.95*(.35+.65*(v?v.opacity.current:1)):n?.3:.9;m.style.opacity=C.toFixed(2),S?m.setAttribute("data-hub",""):m.removeAttribute("data-hub")}let d=Math.max(8,Math.min(48,14*(this.fitDist/Math.max(1,this.view.dist)))),u=0;for(let f=0;f<this.paintRank.length;f++){let m=this.paintRank[f],v=a[f];if(!m||!v)continue;let g=m.node.id;if(c(g))continue;let p=m.label;p.removeAttribute("data-emphasised"),p.removeAttribute("data-selected");let A=m.territory?.hub,w=A?A.lod:0,M=this.neighbourIds?.has(g)??!1;if(w>.35||!v.ok||v.opacity<.2||n!==null&&!M||!M&&u>=d){p.style.display="none";continue}let{sx:y,sy:S,camDist:C,screenR:_}=v,E=m.labelW/2+4;if(y-E<this.insets.left+an||y+E>this.width-this.insets.right-an||S-_-23<this.insets.top+an||S-_-3>this.height-this.insets.bottom-an){p.style.display="none";continue}let R=y,I=S-_-13,L=!1;for(let z=0;z<l;z++){if(z===f)continue;let k=a[z];if(!k||!k.ok||k.opacity<=.2||k.screenR<=13||k.camDist>=C-1)continue;let $=z>=o?1.15:.92;if(Math.hypot(R-k.sx,I-k.sy)<k.screenR*$){L=!0;break}}if(L){p.style.display="none";continue}if(!this.placeBox(y-E,S-_-23,y+E,S-_-3)){p.style.display="none";continue}let Y=1;M||(Y=Math.max(0,Math.min(1,d-u)),u+=1);let q=Math.max(0,Math.min(1,(C-this.fog.near)/Math.max(1,this.fog.far-this.fog.near))),O=Math.max(.35,(1-q*.5)*Math.min(1,m.opacity.current+.1))*Y*(1-w/.35);h(m,y,S-_-4,O)}this.positionPopup(),this.projectEdgeLabels()}projectEdgeLabels(){for(let t of this.edgeVisuals)this.projectEdgeLabel(t);for(let t of this.flowVisuals)this.projectEdgeLabel(t)}projectEdgeLabel(t){if(!(t.emphasised&&!!t.edge.label&&this.view.dist<this.fitDist*1.15&&this.edgeFold(t)>.5)){t.label&&(t.label.style.display="none");return}if(!t.label){let o=document.createElement("div");o.className="rp-map3d-edge-label",o.textContent=t.edge.label,this.labelLayer.appendChild(o),t.label=o;let a=getComputedStyle(o),l=this.measureCtx;l?(l.font=`${a.fontWeight} ${a.fontSize} ${a.fontFamily}`,t.labelW=l.measureText(t.edge.label).width+10):t.labelW=t.edge.label.length*5.4+10}if(this.labelVec.copy(t.from.pos).add(t.to.pos).multiplyScalar(.5).project(this.camera),this.labelVec.z>1||this.labelVec.z<-1){t.label.style.display="none";return}let n=(this.labelVec.x*.5+.5)*this.width,s=(-this.labelVec.y*.5+.5)*this.height,r=t.labelW/2+3;if(!this.placeBox(n-r,s-25,n+r,s-3)){t.label.style.display="none";return}t.label.style.display="block",t.label.style.transform=`translate(-50%, -140%) translate(${n.toFixed(1)}px, ${s.toFixed(1)}px)`}setPaused(t){this.disposed||this.paused===t||(this.paused=t,t?(this.frameHandle!==null&&cancelAnimationFrame(this.frameHandle),this.frameHandle=null):(this.lastFrame=performance.now(),this.renderDirty=!0,this.frameHandle=requestAnimationFrame(this.frame)))}dispose(){this.disposed=!0,this.frameHandle!==null&&cancelAnimationFrame(this.frameHandle),this.unbindPointerHandlers(),this.onContextLost&&this.canvas.removeEventListener("webglcontextlost",this.onContextLost),this.reducedQuery?.removeEventListener("change",this.onReducedChange),this.resizeObserver.disconnect(),this.clearScene(),this.popup.remove(),this.sphereGeo.dispose(),this.shellGeo.dispose(),this.edgeGeometry.dispose(),this.edgeMaterial.dispose(),this.ringGeo.dispose(),this.haloGeo.dispose(),this.territoryGeo.dispose(),this.selectionRingMaterial.dispose(),this.traceRingMaterial.dispose(),this.renderer.dispose()}};var Os={gambling:"gambling",finance:"financial-services",mining:"mining-energy",fossil_fuels:"mining-energy",property:"property-construction",media:"media-communications",hospitality:"hospitality-alcohol",alcohol:"hospitality-alcohol",agriculture:"agriculture",unions:"unions-workplace"},gl={gambling:"Gambling","financial-services":"Financial services","mining-energy":"Mining & energy","property-construction":"Property & construction","media-communications":"Media & communications","hospitality-alcohol":"Hospitality & alcohol",agriculture:"Agriculture","unions-workplace":"Unions & workplace"},zo=i=>(gl[i]??i).toLowerCase().replace(/ & /g," and "),Wg=200,Xg="/api/matrix",Yg=6e4,Bs=null,xh=0;function qg(){return Bs||(Date.now()-xh<Yg?Promise.resolve(null):(Bs=fetch(Xg).then(i=>i.ok?i.json():null).then(i=>$g(i)).catch(()=>null).then(i=>(i||(Bs=null,xh=Date.now()),i)),Bs))}function $g(i){if(!i||typeof i!="object")return null;let t=i;if(!Array.isArray(t.parties)||!t.cells||typeof t.cells!="object"||!t.totals||typeof t.totals!="object")return null;let e={};for(let[s,r]of Object.entries(t.cells)){if(!r||typeof r!="object")continue;let o={};for(let[a,l]of Object.entries(r))typeof l=="number"&&Number.isFinite(l)&&(o[a]=l);e[s]=o}let n={};for(let[s,r]of Object.entries(t.totals))typeof r=="number"&&Number.isFinite(r)&&(n[s]=r);return{labelled:typeof t.labelled=="number"?t.labelled:0,parties:t.parties.filter(s=>typeof s=="string"),cells:e,totals:n}}function _h(i,t){let e=i.cells[t]??{},n=i.totals[t]??0,s=i.parties.filter(r=>r!=="Other").map(r=>{let o=e[r]??0;return{party:r,count:o,share:n>0?o/n:0}}).filter(r=>r.count>0).sort((r,o)=>o.share-r.share||r.party.localeCompare(o.party,"en"));return{total:n,rows:s}}function vh(i){let t=Math.round(i*100);return t===0&&i>0?"<1%":`${t}%`}var yh="money-map-words-styles",Zg=`
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
`;function Jg(){if(document.getElementById(yh))return;let i=document.createElement("style");i.id=yh,i.textContent=Zg,document.head.appendChild(i)}function se(i,t,e){let n=document.createElement(i);return t&&(n.className=t),e.appendChild(n),n}function bh(i){Jg();let{engine:t,raw:e,routeBase:n}=i,s=new Map(e.nodes.map(y=>[y.id,y])),r=!1,o=null,a=null,l=null,c=null,h=y=>`/subject/topic/${y}`,d=(y,S)=>{let C=new URLSearchParams;return C.set("q",zo(y)),C.set("topic",y),S&&C.set("party",S),`/search?${C.toString()}`},u=y=>s.get(`party:${y}`)?.colour??"#79706E",f=y=>{let S=new Map;for(let E of e.nodes){if(E.kind!=="donor"||E.group!==y)continue;let R=Os[E.industry];R&&S.set(R,(S.get(R)??0)+E.total)}let C=null,_=-1;for(let[E,R]of S)R>_&&(_=R,C=E);return C},m=()=>{let y=a??(o?.kind==="donor"?o:null);return y?Os[y.industry]??null:l?f(l):null},v=()=>{let y=r&&c?m():null;if(!y||!c){t.setWordsOverlay(null);return}let S=_h(c,y).rows.filter(R=>s.has(`party:${R.party}`)),C=S[0]?.share??0,_=new Map;for(let R of S)C>0&&_.set(`party:${R.party}`,R.share/C);let E=new Map;for(let R of e.edges){let I=s.get(R.source);if(!I||Os[I.industry]!==y)continue;let L=_.get(R.target);L&&E.set(`${R.source}|${R.target}`,L)}t.setWordsOverlay({rings:_,edgeTint:E})},g=y=>{if(c){y(c);return}qg().then(S=>{S&&(c=S,y(S))})};if(i.legend){let y=se("button","mm-chip mm-words-toggle",i.legend);y.type="button",y.setAttribute("aria-pressed","false"),y.title="Ring each party in bronze by its share of the selected industry's debate",se("span","mm-words-glyph",y).setAttribute("aria-hidden","true");let S=se("span","",y);S.textContent="Words halo",y.addEventListener("click",()=>{r=!r,y.setAttribute("aria-pressed",String(r)),r?g(v):v()})}let p=(y,S,C,_)=>{let E=se("li","",y),R=se("a","mm-words-row mm-words-row-party",E);R.href=d(_,S.party),R.title=`${S.party}: ${S.count.toLocaleString("en-AU")} labelled ${zo(_)} speeches so far. Opens the filtered search.`;let I=se("span","mm-dot",R);I.style.background=u(S.party);let L=se("span","mm-words-name",R);L.textContent=S.party;let Y=se("span","mm-words-track",R);Y.setAttribute("aria-hidden","true");let q=se("i","",Y),O=C>0?S.share/C:0;q.style.width=`${Math.max(O*100,1.5)}%`,q.style.opacity=String(.35+.65*O);let z=se("span","mm-words-pct",R);z.textContent=vh(S.share)},A=(y,S,C)=>{let _=Os[S.industry];if(!_)return;let{total:E,rows:R}=_h(C,_);if(E<=0||R.length===0)return;let I=se("div","mm-legend-title",y);I.textContent="In parliament";let L=se("p","mm-words-lead",y),Y=se("a","",L);Y.href=h(_),Y.textContent=gl[_]??_,L.append(": ");let q=se("b","",L);if(q.textContent=E.toLocaleString("en-AU"),L.append(" labelled speeches so far"),E<Wg){let et=se("span","mm-words-few",L);et.textContent=" \xB7 few labels yet, shares will move"}let O=se("ul","mm-words-rows",y),z=R[0]?.share??0;for(let et of R)p(O,et,z,_);let k=se("p","mm-words-fine",y);k.append("Each party's share of the speeches labelled with this topic. ");let $=se("a","",k);$.href=h(_),$.textContent=`All ${zo(_)} speeches`},w=(y,S,C,_)=>{let E=S.label;if(!C.parties.includes(E))return;let R=new Map;for(let z of _.edges){if(z.target!==S.id)continue;let k=s.get(z.source),$=k?Os[k.industry]:void 0;$&&R.set($,(R.get($)??0)+z.total)}let I=[...R.entries()].map(([z,k])=>{let $=C.totals[z]??0,et=C.cells[z]?.[E]??0;return{slug:z,dollars:k,count:et,share:$>0?et/$:0}}).filter(z=>z.count>0).sort((z,k)=>k.share-z.share||k.dollars-z.dollars).slice(0,5);if(I.length===0)return;let L=se("div","mm-legend-title",y);L.textContent="What they talk about";let Y=se("ul","mm-words-rows",y),q=I[0]?.share??0;for(let z of I){let k=se("li","",Y),$=se("a","mm-words-row mm-words-row-topic",k);$.href=h(z.slug),$.title=`${E}: ${z.count.toLocaleString("en-AU")} of ${(C.totals[z.slug]??0).toLocaleString("en-AU")} labelled ${zo(z.slug)} speeches so far; ${Oe(z.dollars)} disclosed from the matching donors${_.span?` in ${_.span}`:""}. Opens the topic page.`;let et=se("span","mm-words-name",$);et.textContent=gl[z.slug]??z.slug;let rt=se("span","mm-words-track",$);rt.setAttribute("aria-hidden","true");let ot=se("i","",rt),_t=q>0?z.share/q:0;ot.style.width=`${Math.max(_t*100,1.5)}%`,ot.style.opacity=String(.35+.65*_t);let Vt=se("span","mm-words-pct",$);Vt.textContent=vh(z.share);let te=se("span","mm-words-money",$);te.textContent=Oe(z.dollars)}let O=se("p","mm-words-fine",y);O.textContent=_.span?`${E}'s share of each debate's labelled speeches so far, across all years, beside what it received from donors in the matching industry in ${_.span}. Shown together for comparison, not as cause.`:`${E}'s share of each debate's labelled speeches so far, beside what it received from donors in the matching industry. Shown together for comparison, not as cause.`},M=(y,S,C)=>{let _=document.createElement("div");_.className="mm-words",_.hidden=!0;let E=y.querySelector(".mm-ask");E?y.insertBefore(_,E):y.appendChild(_),g(R=>{_.isConnected&&(S.kind==="donor"?A(_,S,R):w(_,S,R,C),_.hidden=_.childElementCount===0)})};return{select(y,S,C){o=y,a=null,y&&M(S,y,C),r&&g(v)},selectEdge(y){o=null,a=y?s.get(y.source)??null:null,r&&g(v)},isolate(y){l=y,r&&g(v)}}}var Eh=1e4;function xi(i,t){return i?i===t?`${i}`:`${i}\u2013${t}`:""}var wh=i=>({id:i.id,label:i.label,group:i.group,weight:i.total/Eh,kind:i.kind,industry:i.industry,total:i.total,count:i.count,firstYear:i.firstYear,lastYear:i.lastYear,...i.colour?{colour:i.colour}:{}}),Th=i=>({source:i.source,target:i.target,label:Oe(i.total),weight:i.total/Eh,total:i.total,count:i.count,firstYear:i.firstYear,lastYear:i.lastYear});function Mh(i,t,e){if(!i.byYear)return i;let n=i.undated?.[0]??0,s=i.undated?.[1]??0,r=null,o=null;for(let[a,[l,c]]of Object.entries(i.byYear)){let h=Number(a);h<t||h>e||(n+=l,s+=c,(r===null||h<r)&&(r=h),(o===null||h>o)&&(o=h))}return{...i,total:n,count:s,firstYear:r,lastYear:o}}function Kg(i){let t=new Map,e=0;for(let a of mi.keys())t.set(a,e++);let n=new Map;for(let a of i.nodes)n.set(a.group,(n.get(a.group)??0)+1);let s=new Map;for(let[a,l]of n){let c=yn(a);s.set(a,{slot:t.get(a)??t.get("other")??0,colour:c.colour,ink:c.ink,hollow:!1,count:l})}let r=i.nodes.map(wh),o=i.edges.map(Th);return{nodes:r,edges:o,groupStyles:s,degrees:ks(o)}}var Sh="money-map-styles",jg=`
.mm-root ::-webkit-scrollbar { width: 8px; height: 8px; }
.mm-root ::-webkit-scrollbar-track { background: transparent; }
.mm-root ::-webkit-scrollbar-thumb { background: #cfc9ba; border-radius: 4px; }
.mm-root ::-webkit-scrollbar-thumb:hover { background: #a0761b; }
.mm-root * { scrollbar-width: thin; scrollbar-color: #cfc9ba transparent; }
.mm-root { position: relative; overflow: hidden; background: ${Pn};
  font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #33322e;
  transition: height 360ms cubic-bezier(0.22, 0.7, 0.3, 1); }
@media (prefers-reduced-motion: reduce) { .mm-root { transition: none; } }
/* A host grown to hold its card (see fitHostToCard): the card may use the room. */
.mm-root.mm-grown .mm-card { max-height: calc(100% - 64px); }
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
`;function Qg(){if(document.getElementById(Sh))return;let i=document.createElement("style");i.id=Sh,i.textContent=jg,document.head.appendChild(i)}function It(i,t,e){let n=document.createElement(i);return t&&(n.className=t),e.appendChild(n),n}async function Xv(i,t,e={}){Qg(),i.classList.add("mm-root");let n=await fetch(t);if(!n.ok)throw new Error(`money map data: HTTP ${n.status} for ${t}`);let s=await n.json();if(!gh()){let V=It("div","mm-fallback",i);V.textContent="The 3D money map needs WebGL, which this browser does not offer. The underlying data is available as JSON at "+t;let K=()=>{};return{select:K,isolate:K,fit:K,setPaused:K,destroy:()=>V.remove()}}let r=Kg(s),o=new Map(s.nodes.map(V=>[V.id,V])),a=e.chrome??"full";i.dataset.mmChrome=a;let l="",c=e.askUrl??(V=>`/ask?q=${encodeURIComponent(`What has parliament said about ${V}?`)}`),h=2026,d=1998;for(let V of s.edges)V.firstYear&&(h=Math.min(h,V.firstYear)),V.lastYear&&(d=Math.max(d,V.lastYear));let u=h,f=d,m={nodes:o,edges:s.edges,span:null},v=It("canvas","mm-canvas",i);v.tabIndex=0,v.setAttribute("role","application"),v.setAttribute("aria-label","Money map - drag to orbit, pinch or scroll to zoom, click a node for details. With the keyboard: arrows orbit, plus and minus zoom, Enter selects the node nearest the middle, Escape clears the selection.");let g=It("div","mm-labels",i);g.setAttribute("aria-hidden","true");let p=a==="full",A=p?It("div","mm-legend",i):null;if(A){let V=It("div","mm-legend-title",A);V.textContent="Industries \xB7 click to isolate"}let w=It("div","mm-card",i),M=null,y=()=>{M!==null&&(i.style.height=M,M=null,i.classList.remove("mm-grown"))},S=()=>{if(w.hidden){y();return}let V=w.style.maxHeight;w.style.maxHeight="none";let K=w.scrollHeight;w.style.maxHeight=V;let vt=K+16+56,yt=i.getBoundingClientRect().height,St=M===null?yt:parseFloat(M)||yt;if(vt<=St){y();return}M===null&&(M=i.style.height),i.classList.add("mm-grown"),i.style.height=`${Math.round(Math.min(vt,window.innerHeight*.85))}px`};w.tabIndex=-1,w.setAttribute("role","region"),w.setAttribute("aria-label","Details for the selected node"),w.hidden=!0;let C=p?It("div","mm-zoom",i):null;if(C){let V=(K,vt,yt)=>{let St=It("button","",C);St.type="button",St.textContent=K,St.setAttribute("aria-label",vt),St.title=vt,St.addEventListener("click",yt)};V("+","Zoom in",()=>L.zoomBy(1.3)),V("\u2212","Zoom out",()=>L.zoomBy(1/1.3)),V("\u2922","Fit the whole map to view",()=>L.fit(!0))}let _=p?It("p","mm-hint",i):null;if(_){let V=typeof s.meta?.sourceShort=="string"?s.meta.sourceShort:"AEC returns";_.textContent=`Drag to orbit \xB7 scroll to zoom \xB7 click a cluster to open it \xB7 click a node or a flow \xB7 ${V} ${s.meta?.coverage??"1998\u20132026"}`}let E=null,R=null,I=null,L=new Bo(v,g,V=>Ht(V,{user:!0}),()=>{v.replaceWith(Object.assign(document.createElement("div"),{className:"mm-fallback",textContent:"The 3D view lost its graphics context. Reload the page to restart it."}))});L.onEdgePick=V=>Yt(V);let Y=bh({engine:L,raw:s,legend:A,routeBase:l}),q=()=>{let V=i.getBoundingClientRect();if(V.width<1||V.height<1)return 1.5;let K=V.width/V.height;return K<1?.8:K<1.45?1.2:1.9},O="",z=({keepFocus:V=!1}={})=>{let K=u>h||f<d,vt=D=>!K||(D.byYear?D.total>0:(D.firstYear??h)<=f&&(D.lastYear??d)>=u),yt=K?s.nodes.map(D=>Mh(D,u,f)):s.nodes,St=(K?s.edges.map(D=>Mh(D,u,f)):s.edges).filter(vt);m={nodes:K?new Map(yt.map(D=>[D.id,D])):o,edges:St,span:K?xi(u,f):null};let P=new Set(St.map(D=>D.source)),Dt=yt.filter(D=>D.group==="parties"?!0:I!==null&&D.group!==I?!1:!K||P.has(D.id)),gt=new Set(Dt.map(D=>D.id)),T=St.filter(D=>gt.has(D.source)&&gt.has(D.target)).map(Th),x={nodes:Dt.map(wh),edges:T,groupStyles:r.groupStyles,degrees:ks(T),measure:"resources",layout:"grouped",aspect:q(),centralGroup:"parties"};L.setData(x);let U=`${x.aspect}|${I??"*"}`;if(U!==O){let D=O==="";O=U,L.setInsets(Gt()),L.fit(!D)}if(E)gt.has(E)?ee():Ht(null);else if(R){let D=R,W=D.hub?void 0:T.find(nt=>nt.source===D.source&&nt.target===D.target);W?(R=W,ee()):Yt(null)}V&&E&&gt.has(E)&&(L.setInsets(Gt()),L.focusOn(E,null))},k=q(),$=new ResizeObserver(()=>{let V=i.getBoundingClientRect();if(V.width<1||V.height<1)return;L.setInsets(Gt());let K=q();K!==k?(k=K,z()):L.viewOwned||L.fit(!1)});$.observe(i);let et=new Map,rt=V=>{I=V!==null&&V!=="parties"&&r.groupStyles.has(V)?V:null;for(let[K,vt]of et)vt.setAttribute("aria-pressed",String(K===I)),I!==null&&K!==I?vt.setAttribute("data-dimmed",""):vt.removeAttribute("data-dimmed");z(),Y.isolate(I)};if(A){let V=[...mi.keys()].filter(K=>K!=="parties"&&r.groupStyles.has(K));for(let K of V){let vt=It("button","mm-chip",A);vt.type="button",vt.setAttribute("aria-pressed","false");let yt=It("span","mm-dot",vt);yt.style.background=yn(K).colour;let St=It("span","",vt);St.textContent=`${K.charAt(0).toUpperCase()}${K.slice(1)} \xB7 ${r.groupStyles.get(K)?.count??0}`,vt.addEventListener("click",()=>rt(I===K?null:K)),et.set(K,vt)}}let ot=p?It("div","mm-find",i):null;if(ot){let V=It("input","",ot);V.type="search",V.placeholder="Find a donor or party\u2026",V.setAttribute("aria-label","Find a donor or party by name");let K=It("ul","mm-find-list",ot),vt=()=>{let yt=V.value.trim().toLowerCase();if(K.replaceChildren(),yt.length<2)return;let St=r.nodes.map(P=>{let Dt=P.label.toLowerCase(),gt=Dt.indexOf(yt),T=gt===0?0:Dt.includes(` ${yt}`)?1:gt>0?2:-1;return{n:P,score:T,at:gt}}).filter(P=>P.score>=0).sort((P,Dt)=>P.score-Dt.score||P.n.label.length-Dt.n.label.length).slice(0,8);for(let{n:P}of St){let Dt=It("li","",K),gt=It("button","",Dt);gt.type="button";let T=It("span","mm-dot",gt);T.style.background=P.colour??yn(P.group).colour;let x=It("span","mm-row-name",gt);x.textContent=P.label,gt.addEventListener("click",()=>{V.value="",K.replaceChildren(),Ht(P.id,{user:!0})})}};V.addEventListener("input",vt),V.addEventListener("keydown",yt=>{yt.key==="Enter"&&K.querySelector("button")?.click(),yt.key==="Escape"&&(V.value="",K.replaceChildren(),yt.stopPropagation())})}let _t=!p,Vt=(e.scrub??p)&&d>h?It("div",_t?"mm-scrub mm-scrub-mini":"mm-scrub",i):null;if(Vt){i.insertBefore(Vt,w),Vt.title="Financial years, by the year each begins: 2024 is 2024\u201325";let V=It("div","mm-scrub-label",Vt);if(!_t){let x=It("span","",V);x.textContent="FINANCIAL YEARS"}let K=It("span","mm-scrub-years",V),vt=_t?It("div","mm-scrub-rail",Vt):Vt,yt=_t?It("div","mm-scrub-fill",It("div","mm-scrub-track",vt)):null,St=It("input","",vt),P=It("input","",vt);for(let[x,U]of[[St,"from"],[P,"to"]])x.type="range",x.min=String(h),x.max=String(d),x.setAttribute("aria-label",`Show flows ${U} year`);St.value=String(h),P.value=String(d);let Dt=()=>{if(K.textContent=u===f?`${u}`:`${u} \u2013 ${f}`,yt){let x=d-h;yt.style.left=`${(u-h)/x*100}%`,yt.style.right=`${(d-f)/x*100}%`}};Dt();let gt=0,T=()=>{let x=Number(St.value),U=Number(P.value);u=Math.min(x,U),f=Math.max(x,U),Dt(),!gt&&(gt=requestAnimationFrame(()=>{gt=0,z({keepFocus:!0})}))};St.addEventListener("input",T),P.addEventListener("input",T)}let te=(V,K,vt,yt,St,P)=>{let Dt=It("li","",V),gt=It("button","mm-row",Dt);if(gt.type="button",P?gt.addEventListener("click",P):gt.disabled=!0,K){let U=It("span","mm-dot",gt);U.style.background=K}let T=It("span","mm-row-name",gt);T.textContent=vt;let x=It("span","mm-row-amt",gt);if(x.textContent=Oe(yt),St){let U=It("span","mm-row-years",gt);U.textContent=St}},$t=(V,K,vt,yt=!1,St=!1)=>{let P=It("a",yt?"mm-ask mm-ask-quiet":"mm-ask",V);P.href=K,P.textContent=vt,St&&(P.target="_blank",P.rel="noopener")},j=(V,K)=>`/subject/${V}/${encodeURIComponent(K)}`,at=V=>{let K=new Map;for(let St of m.edges){if(St.target!==V)continue;let P=m.nodes.get(St.source);if(!P||P.industry==="other")continue;let Dt=P.industry.replace(/_/g," ");K.set(Dt,(K.get(Dt)??0)+St.total)}let vt=null,yt=0;for(let[St,P]of K)P>yt&&(yt=P,vt=St);return vt},it=V=>{w.innerHTML="";let K=It("button","mm-card-close",w);K.type="button",K.textContent="\u2715",K.setAttribute("aria-label","Close details"),K.addEventListener("click",()=>Ht(null,{user:!0}));let vt=It("h2","",w);vt.textContent=V.label;let yt=It("span","mm-card-tag",w),St=yn(V.group);yt.style.color=V.kind==="party"?V.colour??St.ink:St.ink,yt.textContent=V.kind==="party"?"political party":V.industry.replace(/_/g," ");let P=It("div","mm-card-total",w);P.textContent=Oe(V.total);let Dt=It("div","mm-card-sub",w),gt=xi(V.firstYear,V.lastYear);Dt.textContent=V.count===0&&m.span?`nothing disclosed in ${m.span}`:V.kind==="party"?`received across ${V.count.toLocaleString()} receipts \xB7 ${gt}`:`given across ${V.count.toLocaleString()} donations \xB7 ${gt}`;let T=It("div","mm-legend-title",w),x=It("ul","mm-rows",w);if(V.kind==="donor"){T.textContent="Where it went";let U=m.edges.filter(D=>D.source===V.id).sort((D,W)=>W.total-D.total);for(let D of U){let W=m.nodes.get(D.target);W&&te(x,W.colour??"#9AA0A8",W.label,D.total,xi(D.firstYear,D.lastYear),()=>Ht(W.id,{user:!0}))}["individual","other",""].includes(V.industry.toLowerCase())||$t(w,c(V.industry.replace(/_/g," ")),"What did parliament say about this industry?"),$t(w,`/search?q=${encodeURIComponent(`"${Ot(V.label)}"`)}`,`What was said about ${Ot(V.label)}?`,!0),$t(w,j("donor",V.label),"Full profile",!0)}else{T.textContent="Top donors shown on the map";let U=m.edges.filter(W=>W.target===V.id).sort((W,nt)=>nt.total-W.total).slice(0,15);for(let W of U){let nt=m.nodes.get(W.source);nt&&te(x,yn(nt.group).colour,nt.label,W.total,xi(W.firstYear,W.lastYear),()=>Ht(nt.id,{user:!0}))}let D=at(V.id);D&&$t(w,`/ask?q=${encodeURIComponent(`What has ${V.label} said about ${D}?`)}`,`Ask what ${V.label} said about ${D}`),$t(w,j("party",V.label),"Full profile",!0)}},Ot=V=>V.replace(/\s+(Pty\.?\s*)?(Ltd|Limited|Incorporated|Inc)\.?$/i,""),kt=(V,K)=>{let vt=m.nodes.get(V.target);if(!vt)return;w.innerHTML="";let yt=It("button","mm-card-close",w);yt.type="button",yt.textContent="\u2715",yt.setAttribute("aria-label","Close details"),yt.addEventListener("click",()=>Yt(null));let St=yn(K),P=K.charAt(0).toUpperCase()+K.slice(1),Dt=It("h2","",w);Dt.textContent=`${P} \u2192 ${vt.label}`;let gt=It("span","mm-card-tag",w);gt.style.color=St.ink,gt.textContent="industry flow";let T=It("div","mm-card-total",w);T.textContent=Oe(V.total??0);let x=It("div","mm-card-sub",w),U=xi(V.firstYear??null,V.lastYear??null),D=V.count??0;x.textContent=`from ${D===1?"1 donor":`${D.toLocaleString()} donors`} shown${U?` \xB7 ${U}`:""}`;let W=It("div","mm-legend-title",w);W.textContent="Largest donors in this flow";let nt=It("ul","mm-rows",w),lt=m.edges.filter(J=>J.target===vt.id&&m.nodes.get(J.source)?.group===K).sort((J,st)=>st.total-J.total).slice(0,12);for(let J of lt){let st=m.nodes.get(J.source);st&&te(nt,St.colour,st.label,J.total,xi(J.firstYear,J.lastYear),()=>Ht(st.id,{user:!0}))}["individuals","other"].includes(K)||$t(w,c(K),`What has parliament said about ${K}?`);let Z=It("button","mm-ask mm-ask-quiet",w);Z.type="button",Z.textContent=`Show only ${K} on the map`,Z.addEventListener("click",()=>{Yt(null),rt(K)})},Lt=V=>{if(V.hub){kt(V,V.hub);return}let K=m.nodes.get(V.source),vt=m.nodes.get(V.target);if(!K||!vt)return;w.innerHTML="";let yt=It("button","mm-card-close",w);yt.type="button",yt.textContent="\u2715",yt.setAttribute("aria-label","Close details"),yt.addEventListener("click",()=>Yt(null));let St=It("h2","",w);St.textContent=`${K.label} \u2192 ${vt.label}`;let P=It("span","mm-card-tag",w);P.style.color=yn(K.group).ink,P.textContent=`${K.industry.replace(/_/g," ")} money`;let Dt=It("div","mm-card-total",w);Dt.textContent=Oe(V.total??0);let gt=It("div","mm-card-sub",w),T=xi(V.firstYear??null,V.lastYear??null);gt.textContent=`across ${(V.count??0).toLocaleString()} donations${T?` \xB7 ${T}`:""}`;let x=It("ul","mm-rows",w);if(te(x,K.colour??yn(K.group).colour,K.label,K.total,"",()=>Ht(K.id,{user:!0})),te(x,vt.colour??"#9AA0A8",vt.label,vt.total,"",()=>Ht(vt.id,{user:!0})),V.firstYear&&V.lastYear){let U=K.industry.replace(/_/g," ");$t(w,`/search?q=${encodeURIComponent(U)}&from=${V.firstYear}&to=${V.lastYear}`,`What was said about ${U} in ${T}?`)}},ce=()=>{let V={left:0,right:0,top:0,bottom:0},K=i.getBoundingClientRect();if(K.width<1||K.height<1)return V;let vt=10,yt=(P,Dt)=>{if(!P)return;let gt=P.getBoundingClientRect();if(gt.width<1||gt.height<1)return;if(Dt==="top"||Dt==="bottom"){let U=gt.right-K.left-V.left,D=K.right-gt.left-V.right;if(U<=24||D<=24)return}let T=Dt==="left"?gt.right-K.left:Dt==="right"?K.right-gt.left:Dt==="top"?gt.bottom-K.top:K.bottom-gt.top,x=Dt==="left"||Dt==="right"?K.width*.4:K.height*.4;V[Dt]=Math.max(V[Dt],Math.min(T+vt,x))},St=A!==null&&A.getBoundingClientRect().width>K.width*.5;if(A&&!St&&yt(A,"left"),yt(C,"right"),A&&St&&yt(A,"top"),yt(ot,"top"),Vt){let P=Vt.getBoundingClientRect(),Dt=P.top+P.height/2<K.top+K.height/2;yt(Vt,Dt?"top":"bottom")}return yt(_,"bottom"),V},Gt=()=>{let V=ce();if(w.hidden)return V;let K=w.getBoundingClientRect(),vt=i.getBoundingClientRect();return K.width>=vt.width-40?V.bottom=Math.max(V.bottom,K.height+16):V.right=Math.max(V.right,K.width+24),V},ee=()=>{let V=w.scrollTop;if(E){let K=m.nodes.get(E);if(!K)return;it(K),Y.select(K,w,m)}else R&&(L.setEmphasis({selectedId:null,pathEdges:[R],pathFrom:null}),Lt(R));w.scrollTop=V};function Ht(V,{user:K=!1}={}){E=V,R=null;let vt=V?m.nodes.get(V)??null:null;L.setEmphasis({selectedId:V,pathEdges:null,pathFrom:null}),vt?(it(vt),w.hidden=!1,S(),requestAnimationFrame(()=>{w.hidden||(L.setInsets(Gt()),E&&L.focusOn(E,null))}),w.focus({preventScroll:!0})):(w.hidden=!0,w.innerHTML="",y(),L.setInsets(ce())),Y.select(vt,w,m),K&&e.onSelect?.(vt)}function Yt(V){R=V,E=null,L.setEmphasis({selectedId:null,pathEdges:V?[V]:null,pathFrom:null}),V?(Lt(V),w.hidden=!1,S(),requestAnimationFrame(()=>{w.hidden||L.setInsets(Gt())}),w.focus({preventScroll:!0})):(w.hidden=!0,w.innerHTML="",y(),L.setInsets(ce())),Y.selectEdge(V)}let fe=V=>{V.key==="Escape"&&(E||R)&&(R?Yt(null):Ht(null,{user:!0}),v.focus({preventScroll:!0}),V.stopPropagation())};return i.addEventListener("keydown",fe),z(),e.focus&&o.has(e.focus)&&Ht(e.focus),{select:V=>Ht(V),isolate:V=>rt(V),fit:(V=!0)=>L.fit(V),setPaused:V=>L.setPaused(V),destroy:()=>{i.removeEventListener("keydown",fe),$.disconnect(),L.dispose();for(let V of[v,g,A,w,C,_,ot,Vt])V?.remove();i.classList.remove("mm-root"),delete i.dataset.mmChrome}}}export{mi as CLUSTER_COLOURS,Fs as ForceSim3D,ks as buildDegrees,Kg as buildGraph,pl as clusterCentres3D,yn as clusterColour,Oe as formatMoney,Xv as mountMoneyMap,Go as radiusFor,Ho as shortLabel,gh as webglAvailable,Mh as windowFigures};
/*! Bundled license information:

three/build/three.core.js:
three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2026 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
