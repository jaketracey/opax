// RFC 4180 field boundaries reset identity matching, including escaped quotes
// and multiline fields. Retain only the current field beside the request text.
export function* csvFields(csv) {
  let field='',quoted=false,closed=false;
  for(let i=0;i<csv.length;i++){
    const c=csv[i];
    if(quoted){if(c==='"'){if(csv[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c===','||c==='\r'||c==='\n'){yield field;field='';closed=false;if(c==='\r'&&csv[i+1]==='\n')i++;continue;}
    if(c==='"'){if(field||closed)throw Error('Invalid CSV');quoted=true;continue;}
    if(closed)throw Error('Invalid CSV');field+=c;
  }
  if(quoted)throw Error('Invalid CSV');yield field;
}
export function csvIdentityCheck(csv,blocked) {
  try {for(const field of csvFields(csv))if(blocked(field))return true;return false;}catch{return true;}
}
