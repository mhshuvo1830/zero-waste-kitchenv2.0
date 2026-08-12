import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, updateEmail, sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";

const firebaseConfigured = Boolean(firebaseConfig?.apiKey && firebaseConfig?.projectId && !String(firebaseConfig.apiKey).startsWith("YOUR_") && !String(firebaseConfig.projectId).startsWith("YOUR_"));
let firebaseApp=null, auth=null, db=null, storage=null;
if(firebaseConfigured){ firebaseApp=initializeApp(firebaseConfig); auth=getAuth(firebaseApp); db=getFirestore(firebaseApp); storage=getStorage(firebaseApp); }

const DAY = 86400000;
const today = new Date();
const iso = d => d.toISOString().slice(0,10);
const offsetDate = days => iso(new Date(today.getTime() + days*DAY));

const demoInventory = [
  {id:1,name:"Spinach",category:"Vegetables",qty:1,unit:"bag",storage:"Fridge",expiry:offsetDate(1),emoji:"🥬"},
  {id:2,name:"Greek Yogurt",category:"Dairy",qty:2,unit:"pcs",storage:"Fridge",expiry:offsetDate(2),emoji:"🥣"},
  {id:3,name:"Mushrooms",category:"Vegetables",qty:0.4,unit:"kg",storage:"Fridge",expiry:offsetDate(2),emoji:"🍄"},
  {id:4,name:"Bananas",category:"Fruit",qty:5,unit:"pcs",storage:"Counter",expiry:offsetDate(3),emoji:"🍌"},
  {id:5,name:"Tomatoes",category:"Vegetables",qty:6,unit:"pcs",storage:"Fridge",expiry:offsetDate(5),emoji:"🍅"},
  {id:6,name:"Eggs",category:"Protein",qty:8,unit:"pcs",storage:"Fridge",expiry:offsetDate(8),emoji:"🥚"},
  {id:7,name:"Milk",category:"Dairy",qty:1,unit:"L",storage:"Fridge",expiry:offsetDate(4),emoji:"🥛"},
  {id:8,name:"Bread",category:"Grains",qty:1,unit:"pack",storage:"Pantry",expiry:offsetDate(4),emoji:"🍞"},
  {id:9,name:"Rice",category:"Pantry",qty:1.5,unit:"kg",storage:"Pantry",expiry:offsetDate(90),emoji:"🍚"},
  {id:10,name:"Chickpeas",category:"Pantry",qty:2,unit:"pack",storage:"Pantry",expiry:offsetDate(60),emoji:"🫘"},
  {id:11,name:"Bell Pepper",category:"Vegetables",qty:3,unit:"pcs",storage:"Fridge",expiry:offsetDate(6),emoji:"🫑"},
  {id:12,name:"Carrots",category:"Vegetables",qty:0.7,unit:"kg",storage:"Fridge",expiry:offsetDate(10),emoji:"🥕"},
  {id:13,name:"Cheddar",category:"Dairy",qty:250,unit:"g",storage:"Fridge",expiry:offsetDate(12),emoji:"🧀"},
  {id:14,name:"Onion",category:"Vegetables",qty:5,unit:"pcs",storage:"Pantry",expiry:offsetDate(20),emoji:"🧅"},
  {id:15,name:"Avocado",category:"Fruit",qty:2,unit:"pcs",storage:"Counter",expiry:offsetDate(-1),emoji:"🥑"},
  {id:16,name:"Fresh Herbs",category:"Vegetables",qty:1,unit:"bag",storage:"Fridge",expiry:offsetDate(1),emoji:"🌿"},
  {id:17,name:"Lemon",category:"Fruit",qty:3,unit:"pcs",storage:"Fridge",expiry:offsetDate(14),emoji:"🍋"},
  {id:18,name:"Oats",category:"Grains",qty:700,unit:"g",storage:"Pantry",expiry:offsetDate(120),emoji:"🌾"}
];

const demoShopping = [
  {id:1,name:"Garlic",qty:"1 bulb",checked:false},
  {id:2,name:"Olive oil",qty:"500 ml",checked:false},
  {id:3,name:"Wholegrain wraps",qty:"1 pack",checked:true},
  {id:4,name:"Lentils",qty:"500 g",checked:false}
];
const demoWaste = [
  {id:1,item:"Cucumber",amount:.25,reason:"Forgotten",cost:1.2,date:offsetDate(-2)},
  {id:2,item:"Cooked rice",amount:.35,reason:"Too much cooked",cost:.9,date:offsetDate(-5)},
  {id:3,item:"Strawberries",amount:.18,reason:"Spoiled early",cost:2.4,date:offsetDate(-7)},
  {id:4,item:"Bread",amount:.2,reason:"Forgotten",cost:1.1,date:offsetDate(-10)}
];

let inventory=[];
let shopping=[];
let waste=[];
let readNotifications=[];
let activeUid=null;
let cloudSaveTimer=null;
let cloudWriteInFlight=Promise.resolve();

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let tesseractLoadPromise=null;
function ensureTesseract(){
  if(window.Tesseract) return Promise.resolve(window.Tesseract);
  if(tesseractLoadPromise) return tesseractLoadPromise;
  tesseractLoadPromise=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.async=true;
    script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error("Tesseract loaded without a global API"));
    script.onerror=()=>reject(new Error("Could not load the OCR library"));
    document.head.appendChild(script);
  });
  return tesseractLoadPromise;
}
const stateSnapshot=()=>({inventory,shopping,waste,readNotifications,schemaVersion:1});

async function writeStateToFirestore(){
  if(!firebaseConfigured || !db || !activeUid || !auth?.currentUser || auth.currentUser.uid!==activeUid) return;
  const uid=activeUid, payload=stateSnapshot();
  cloudWriteInFlight=cloudWriteInFlight.catch(()=>{}).then(()=>setDoc(doc(db,"users",uid,"private","state"),{...payload,updatedAt:serverTimestamp()},{merge:true})).catch(err=>{console.error("PantryLoop cloud save failed:",err); if(typeof toast==="function") toast("Could not sync the latest change. Check your connection.");});
  return cloudWriteInFlight;
}
let save=()=>{ if(!activeUid) return; clearTimeout(cloudSaveTimer); cloudSaveTimer=setTimeout(writeStateToFirestore,40); };
function applyState(state={}){ inventory=Array.isArray(state.inventory)?state.inventory:[]; shopping=Array.isArray(state.shopping)?state.shopping:[]; waste=Array.isArray(state.waste)?state.waste:[]; readNotifications=Array.isArray(state.readNotifications)?state.readNotifications:[]; }
async function loadUserState(uid){
  activeUid=uid; applyState({}); if(typeof renderAll==="function") renderAll();
  try{
    const snap=await getDoc(doc(db,"users",uid,"private","state"));
    if(snap.exists()) applyState(snap.data()); else { applyState({inventory:[],shopping:[],waste:[],readNotifications:[]}); await writeStateToFirestore(); }
    if(typeof renderAll==="function") renderAll();
  }catch(err){
    console.error("PantryLoop cloud load failed:",err);
    applyState({});
    if(typeof renderAll==="function") renderAll();
    throw err;
  }
}

const emojiMap = {
  spinach:"🥬", lettuce:"🥬", yogurt:"🥣", mushroom:"🍄", banana:"🍌", tomato:"🍅", egg:"🥚",
  milk:"🥛", bread:"🍞", rice:"🍚", chickpea:"🫘", pepper:"🫑", carrot:"🥕", cheese:"🧀",
  onion:"🧅", avocado:"🥑", herb:"🌿", lemon:"🍋", oats:"🌾", garlic:"🧄", apple:"🍎"
};
function getEmoji(name){
  const key = Object.keys(emojiMap).find(k => name.toLowerCase().includes(k));
  return key ? emojiMap[key] : "🥫";
}
function daysLeft(expiry){
  const end = new Date(expiry+"T23:59:59");
  return Math.ceil((end - new Date())/DAY);
}
function statusOf(item){
  const d = daysLeft(item.expiry);
  return d < 0 ? "expired" : d <= 3 ? "soon" : "fresh";
}
function expiryText(item){
  const d = daysLeft(item.expiry);
  if(d < 0) return `${Math.abs(d)}d expired`;
  if(d === 0) return "Today";
  if(d === 1) return "Tomorrow";
  return `${d} days`;
}
function toast(message){
  const el=$("#toast"); el.textContent=message; el.classList.add("show");
  clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("show"),2200);
}
function go(view){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $(`#${view}View`).classList.add("active");
  $$(".nav-item").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
  const titles = {dashboard:"Good evening, Alex 👋",inventory:"Kitchen inventory",scanner:"Receipt scanner",recipes:"Recipe synthesizer",shopping:"Shopping list",waste:"Waste tracker",insights:"Insights"};
  $("#pageTitle").textContent=titles[view] || "PantryLoop";
  $("#sidebar").classList.remove("open");
  if(view==="recipes") renderRecipes();
  if(view==="shopping") renderShopping();
  if(view==="waste") renderWaste();
  window.scrollTo({top:0,behavior:"smooth"});
}
$$(".nav-item").forEach(b=>b.addEventListener("click",()=>go(b.dataset.view)));
$$("[data-jump]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.jump)));
$("#mobileMenu").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
document.addEventListener("click",e=>{ if(innerWidth<780 && !e.target.closest(".sidebar") && !e.target.closest("#mobileMenu")) $("#sidebar").classList.remove("open"); });

function renderDashboard(){
  const urgent = [...inventory].filter(i=>statusOf(i)!=="fresh").sort((a,b)=>new Date(a.expiry)-new Date(b.expiry));
  $("#heroUrgentCount").textContent = `${Math.max(urgent.length,1)} item${urgent.length===1?"":"s"}`;
  $("#inventoryCountBadge").textContent=inventory.length;
  const fresh=inventory.filter(i=>statusOf(i)==="fresh").length, soon=inventory.filter(i=>statusOf(i)==="soon").length, expired=inventory.filter(i=>statusOf(i)==="expired").length;
  $("#totalItemsStat").textContent=inventory.length; $("#freshStat").textContent=fresh; $("#soonStat").textContent=soon; $("#expiredStat").textContent=expired;
  const score=Math.max(45,Math.min(98,Math.round(100-(expired*5+soon*1.8)+waste.length)));
  $("#scoreValue").textContent=score; $("#scoreRing").style.setProperty("--score",score);
  $("#urgentItems").innerHTML = urgent.slice(0,4).map(i=>`
    <div class="urgent-item">
      <div class="food-icon">${i.emoji||getEmoji(i.name)}</div>
      <div><h4>${i.name}</h4><p>${i.qty} ${i.unit} • ${i.storage}</p></div>
      <span class="expiry-chip ${statusOf(i)==="expired"?"expired":""}">${expiryText(i)}</span>
      <button class="row-btn" data-use="${i.id}">Use in recipe</button>
    </div>`).join("") || `<p class="empty">Everything looks fresh. Nice work.</p>`;
  $$("[data-use]").forEach(b=>b.onclick=()=>{localStorage.setItem("pantryloop_focus",b.dataset.use);go("recipes");renderRecipes();});
  renderFeatured();
  renderCategoryBars();
  $("#shoppingPreview").innerHTML=shopping.filter(s=>!s.checked).slice(0,4).map(s=>`<div class="shop-preview-item"><span class="circle-check"></span><strong>${s.name}</strong><small>${s.qty||""}</small></div>`).join("") || "<p>Your list is clear.</p>";
  const rescued = (12.8 + Math.max(0, waste.length-4)*.2).toFixed(1);
  $("#sidebarSaved").textContent=`${rescued} kg`; $("#impactSaved").textContent=`${rescued} kg`;
}
function renderCategoryBars(){
  const counts={};
  inventory.forEach(i=>counts[i.category]=(counts[i.category]||0)+1);
  const max=Math.max(...Object.values(counts),1);
  $("#categoryBars").innerHTML=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`
    <div class="category-row"><span>${k}</span><div class="category-track"><span style="width:${(v/max)*100}%"></span></div><b>${v}</b></div>`).join("");
}
const recipeBank = [
  {title:"Creamy Spinach & Mushroom Skillet",emoji:"🍳",time:22,diet:"vegetarian",uses:["Spinach","Mushrooms","Greek Yogurt"],desc:"A fast skillet dinner using your most perishable greens and mushrooms.",serves:2},
  {title:"Banana Oat Breakfast Pancakes",emoji:"🥞",time:18,diet:"vegetarian",uses:["Bananas","Oats","Eggs","Milk"],desc:"Soft pantry-friendly pancakes that rescue ripe bananas without extra shopping.",serves:2},
  {title:"Roasted Veggie Rescue Bowl",emoji:"🥗",time:30,diet:"vegan",uses:["Bell Pepper","Carrots","Tomatoes","Chickpeas"],desc:"Roast mixed vegetables and chickpeas, then finish with lemon and herbs.",serves:3},
  {title:"Tomato Egg Fried Rice",emoji:"🍚",time:20,diet:"high-protein",uses:["Tomatoes","Eggs","Rice","Onion"],desc:"A quick fried rice built from leftover rice, eggs, and ripe tomatoes.",serves:2},
  {title:"Herby Chickpea Toast",emoji:"🥪",time:12,diet:"vegan",uses:["Bread","Chickpeas","Fresh Herbs","Lemon"],desc:"Mash chickpeas with lemon and herbs for a zero-fuss rescue lunch.",serves:2},
  {title:"Fridge-Clear Veggie Frittata",emoji:"🥘",time:28,diet:"high-protein",uses:["Eggs","Spinach","Mushrooms","Cheddar"],desc:"Flexible baked eggs designed to absorb small quantities of leftover vegetables.",serves:3},
  {title:"Creamy Tomato Pasta-Style Rice",emoji:"🍲",time:25,diet:"vegetarian",uses:["Tomatoes","Greek Yogurt","Rice","Cheddar"],desc:"A comforting one-pan rice dish using dairy and tomatoes nearing their date.",serves:2},
  {title:"Warm Carrot Chickpea Bowl",emoji:"🥕",time:30,diet:"vegan",uses:["Carrots","Chickpeas","Onion","Lemon"],desc:"Sweet carrots and chickpeas with bright lemon, ideal for batch lunches.",serves:3}
];
function matchScore(recipe){
  return recipe.uses.reduce((n,u)=>n+(inventory.some(i=>i.name.toLowerCase().includes(u.toLowerCase().split(" ")[0]))?1:0),0);
}
function renderFeatured(){
  const candidates=[...recipeBank].sort((a,b)=>matchScore(b)-matchScore(a));
  const r=candidates[Math.floor(Math.random()*Math.min(3,candidates.length))];
  $("#featuredRecipe").innerHTML=`<span class="recipe-emoji">${r.emoji}</span><div class="tag-row"><span class="mini-tag">⏱ ${r.time} min</span><span class="mini-tag">♻ ${matchScore(r)} pantry matches</span></div><h4>${r.title}</h4><p>${r.desc}</p>`;
}
$("#refreshFeaturedRecipe").onclick=renderFeatured;

function renderInventory(){
  const q=$("#inventorySearch").value.toLowerCase(), cat=$("#categoryFilter").value, st=$("#statusFilter").value, sort=$("#sortFilter").value;
  let items=inventory.filter(i=>(!q||i.name.toLowerCase().includes(q))&&(cat==="all"||i.category===cat)&&(st==="all"||statusOf(i)===st));
  items.sort(sort==="name"?(a,b)=>a.name.localeCompare(b.name):sort==="qty"?(a,b)=>b.qty-a.qty:(a,b)=>new Date(a.expiry)-new Date(b.expiry));
  $("#inventoryTableBody").innerHTML=items.map(i=>`
    <tr>
      <td><div class="ingredient-cell"><span class="food-icon">${i.emoji||getEmoji(i.name)}</span><div><strong>${i.name}</strong><small style="display:block;color:#81908a">${i.category}</small></div></div></td>
      <td>${i.qty} ${i.unit}</td><td>${i.storage}</td><td>${new Date(i.expiry+"T00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"})}</td>
      <td><span class="status-${statusOf(i)}"><i class="status-dot"></i>${statusOf(i)==="soon"?"Use soon":statusOf(i)[0].toUpperCase()+statusOf(i).slice(1)}</span></td>
      <td><div class="table-actions"><button title="Edit" data-edit="${i.id}">✎</button><button title="Delete" data-delete="${i.id}">×</button></div></td>
    </tr>`).join("") || `<tr><td colspan="6">No matching items.</td></tr>`;
  $$("[data-edit]").forEach(b=>b.onclick=()=>openItemModal(Number(b.dataset.edit)));
  $$("[data-delete]").forEach(b=>b.onclick=()=>{inventory=inventory.filter(i=>i.id!==Number(b.dataset.delete));save();renderAll();toast("Item removed");});
}
function updateCategoryFilter(){
  const current=$("#categoryFilter").value;
  const cats=[...new Set(inventory.map(i=>i.category))].sort();
  $("#categoryFilter").innerHTML=`<option value="all">All categories</option>`+cats.map(c=>`<option ${c===current?"selected":""}>${c}</option>`).join("");
}
["inventorySearch","categoryFilter","statusFilter","sortFilter"].forEach(id=>$("#"+id).addEventListener("input",renderInventory));

function openItemModal(id=null){
  $("#modalBackdrop").hidden=false;
  if(id){
    const i=inventory.find(x=>x.id===id);
    $("#modalTitle").textContent="Edit pantry item"; $("#editItemId").value=i.id; $("#itemName").value=i.name; $("#itemCategory").value=i.category; $("#itemQty").value=i.qty; $("#itemUnit").value=i.unit; $("#itemStorage").value=i.storage; $("#itemExpiry").value=i.expiry;
  }else{
    $("#modalTitle").textContent="Add pantry item"; $("#itemForm").reset(); $("#editItemId").value=""; $("#itemQty").value=1; $("#itemExpiry").value=offsetDate(7);
  }
}
function closeItemModal(){ $("#modalBackdrop").hidden=true; }
$("#modalClose").onclick=$("#cancelModal").onclick=closeItemModal;
$("#addItemBtn").onclick=$("#addInventoryBtn").onclick=()=>openItemModal();
$("#itemForm").onsubmit=e=>{
  e.preventDefault();
  const id=Number($("#editItemId").value)||Date.now();
  const obj={id,name:$("#itemName").value.trim(),category:$("#itemCategory").value,qty:Number($("#itemQty").value),unit:$("#itemUnit").value,storage:$("#itemStorage").value,expiry:$("#itemExpiry").value,emoji:getEmoji($("#itemName").value)};
  const idx=inventory.findIndex(i=>i.id===id); idx>=0?inventory[idx]=obj:inventory.push(obj);
  save();closeItemModal();renderAll();toast(idx>=0?"Item updated":"Item added to pantry");
};
$("#seedDemoBtn").onclick=()=>{inventory=JSON.parse(JSON.stringify(demoInventory));save();renderAll();toast("Demo inventory restored");};

$("#quickScanBtn").onclick=()=>go("scanner");
$("#demoScanBtn").onclick=()=>{
  $("#receiptText").value="Milk 1L\nSpinach 1 bag\nBananas 6\nEggs 12\nBread 1 pack";
  parseReceipt();
};
function parseReceipt(){
  const text=$("#receiptText").value.trim();
  if(!text){toast("Paste or enter receipt text first");return}
  const shelf={milk:5,spinach:4,banana:5,egg:21,bread:6,tomato:7,yogurt:7,mushroom:5,carrot:14};
  const rows=text.split(/\n/).map(x=>x.trim()).filter(Boolean);
  const results=rows.map((line,idx)=>{
    const clean=line.replace(/[.$€£]\s?\d+([.,]\d+)?/g,"").replace(/\s{2,}/g," ").trim();
    const nums=clean.match(/\d+(\.\d+)?/g);
    const qty=nums?Number(nums[0]):1;
    const name=clean.replace(/\d+(\.\d+)?\s*(kg|g|l|ml|pcs|pk|pack|bag|x)?/ig,"").replace(/\bx\d+\b/ig,"").trim().replace(/\bpk\b/ig,"").trim();
    const key=Object.keys(shelf).find(k=>name.toLowerCase().includes(k));
    return {id:Date.now()+idx,name:name||line,qty,days:key?shelf[key]:10,checked:true};
  });
  $("#scanResults").dataset.items=JSON.stringify(results);
  $("#scanResults").innerHTML=results.map((r,i)=>`<div class="scan-result"><label><input type="checkbox" data-scan-check="${i}" checked> <b>${r.name}</b></label><small>${r.qty} • ~${r.days}d shelf life</small></div>`).join("")+
    `<button class="primary-btn full" id="importScanBtn">Add selected to inventory</button>`;
  $("#importScanBtn").onclick=()=>{
    const data=JSON.parse($("#scanResults").dataset.items||"[]");
    const checked=$$("[data-scan-check]").filter(c=>c.checked).map(c=>Number(c.dataset.scanCheck));
    checked.forEach(i=>{
      const r=data[i]; inventory.push({id:Date.now()+Math.random(),name:r.name,category:guessCategory(r.name),qty:r.qty,unit:"pcs",storage:guessStorage(r.name),expiry:offsetDate(r.days),emoji:getEmoji(r.name)});
    });
    save();renderAll();toast(`${checked.length} item${checked.length===1?"":"s"} added`);go("inventory");
  };
}
$("#parseReceiptBtn").onclick=parseReceipt;
function guessCategory(name){
  const n=name.toLowerCase(); if(/milk|yogurt|cheese/.test(n))return"Dairy"; if(/banana|apple|lemon|avocado/.test(n))return"Fruit"; if(/egg|chicken|fish/.test(n))return"Protein"; if(/bread|oat|rice|pasta/.test(n))return"Grains"; if(/spinach|tomato|mushroom|carrot|pepper|onion/.test(n))return"Vegetables"; return"Pantry";
}
function guessStorage(name){ return /rice|oat|bread|onion|banana/.test(name.toLowerCase())?"Pantry":"Fridge"; }

function renderRecipes(){
  const max=Number($("#recipeTime").value), diet=$("#recipeDiet").value, zero=$("#zeroBuyToggle").checked;
  let list=recipeBank.filter(r=>r.time<=max && (diet==="any"||r.diet===diet|| (diet==="vegetarian"&&r.diet!=="high-protein")));
  if(zero) list=list.filter(r=>matchScore(r)>=Math.max(2,r.uses.length-1));
  list.sort((a,b)=>matchScore(b)-matchScore(a));
  $("#recipeGrid").innerHTML=list.map((r,i)=>`
    <article class="recipe-card">
      <div class="recipe-art">${r.emoji}</div>
      <div class="recipe-body"><h3>${r.title}</h3><p>${r.desc}</p>
      <div class="recipe-meta"><span class="mini-tag">⏱ ${r.time} min</span><span class="mini-tag">🍽 ${r.serves} servings</span><span class="mini-tag">♻ ${matchScore(r)}/${r.uses.length} matched</span></div>
      <button class="primary-btn" data-cook="${i}">Cook this recipe</button></div>
    </article>`).join("") || `<div class="panel"><h3>No exact match</h3><p>Try a longer cooking time or turn off “Zero-buy recipes.”</p></div>`;
  $$("[data-cook]").forEach((b,idx)=>b.onclick=()=>cookRecipe(list[idx]));
}
function cookRecipe(r){
  const matched=r.uses.filter(u=>inventory.some(i=>i.name.toLowerCase().includes(u.toLowerCase().split(" ")[0])));
  const missing=r.uses.filter(u=>!matched.includes(u));
  if(missing.length){
    missing.forEach(m=>{if(!shopping.some(s=>s.name.toLowerCase()===m.toLowerCase()))shopping.push({id:Date.now()+Math.random(),name:m,qty:"1",checked:false})});
    save();renderShopping();toast(`${missing.length} missing ingredient${missing.length>1?"s":""} added to shopping list`);
  }else toast("Perfect pantry match — no shopping needed");
}
["recipeTime","recipeDiet","zeroBuyToggle","recipePriority"].forEach(id=>$("#"+id).onchange=renderRecipes);
$("#generateRecipesBtn").onclick=()=>{renderRecipes();toast("Recipes refreshed from your pantry");};

function renderShopping(){
  $("#shoppingList").innerHTML=shopping.map(s=>`
    <div class="shopping-item ${s.checked?"checked":""}">
      <input type="checkbox" data-shop-check="${s.id}" ${s.checked?"checked":""}>
      <strong>${s.name}</strong><small>${s.qty||""}</small><button class="danger-btn" data-shop-delete="${s.id}">×</button>
    </div>`).join("") || "<p>Your shopping list is empty.</p>";
  $$("[data-shop-check]").forEach(c=>c.onchange=()=>{const s=shopping.find(x=>x.id==c.dataset.shopCheck);s.checked=c.checked;save();renderShopping();renderDashboard();});
  $$("[data-shop-delete]").forEach(b=>b.onclick=()=>{shopping=shopping.filter(x=>x.id!=b.dataset.shopDelete);save();renderShopping();renderDashboard();});
}
$("#shoppingForm").onsubmit=e=>{
  e.preventDefault();shopping.push({id:Date.now(),name:$("#shoppingInput").value.trim(),qty:$("#shoppingQty").value.trim(),checked:false});
  $("#shoppingInput").value="";$("#shoppingQty").value="";save();renderShopping();renderDashboard();toast("Added to shopping list");
};
$("#clearCheckedBtn").onclick=()=>{shopping=shopping.filter(s=>!s.checked);save();renderShopping();renderDashboard();toast("Checked items cleared");};

function openWasteModal(){ $("#wasteModalBackdrop").hidden=false; }
function closeWasteModal(){ $("#wasteModalBackdrop").hidden=true; }
$("#logWasteBtn").onclick=openWasteModal; $("#wasteModalClose").onclick=$("#cancelWasteModal").onclick=closeWasteModal;
$("#wasteForm").onsubmit=e=>{
  e.preventDefault(); waste.unshift({id:Date.now(),item:$("#wasteItem").value.trim(),amount:Number($("#wasteAmount").value),reason:$("#wasteCause").value,cost:Number($("#wasteEntryCost").value),date:iso(new Date())});
  save();closeWasteModal();$("#wasteForm").reset();renderWaste();renderDashboard();toast("Waste entry logged");
};
function renderWaste(){
  const amount=waste.reduce((a,b)=>a+b.amount,0), cost=waste.reduce((a,b)=>a+b.cost,0);
  $("#wasteMonth").textContent=`${amount.toFixed(1)} kg`;$("#wasteCost").textContent=`$${cost.toFixed(2)}`;
  const reasons={}; waste.forEach(w=>reasons[w.reason]=(reasons[w.reason]||0)+w.amount);
  const top=Object.entries(reasons).sort((a,b)=>b[1]-a[1])[0];$("#wasteReason").textContent=top?top[0]:"—";
  $("#wasteLog").innerHTML=waste.slice(0,8).map(w=>`<div class="activity-item"><div><strong>${w.item}</strong><small>${w.reason} • ${new Date(w.date+"T00:00").toLocaleDateString()}</small></div><b>${w.amount} kg</b></div>`).join("");
  const max=Math.max(...Object.values(reasons),1);
  $("#wasteReasonBars").innerHTML=Object.entries(reasons).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="category-row"><span>${k}</span><div class="category-track"><span style="width:${v/max*100}%"></span></div><b>${v.toFixed(1)}</b></div>`).join("");
}
function renderInsights(){
  const vals=[.9,1.4,.8,1.8,1.1,2.0,1.6], labels=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], max=Math.max(...vals);
  $("#rescueChart").innerHTML=vals.map((v,i)=>`<div class="chart-col"><b>${v}kg</b><div class="chart-bar" style="height:${v/max*82}%"></div><small>${labels[i]}</small></div>`).join("");
}
$("#notificationBtn").onclick=()=>toast(`${inventory.filter(i=>statusOf(i)!=="fresh").length} pantry alerts need attention`);
$("#profileButton").onclick=()=>toast("Profile settings are ready for backend integration");

function renderAll(){updateCategoryFilter();renderInventory();renderDashboard();renderShopping();renderWaste();renderInsights();renderRecipes();}


// ===== FYDP SMART FEATURE UPGRADE =====
function predictRisk(item){
  const d=daysLeft(item.expiry);
  if(d<0) return {score:100,level:"high",label:"Critical"};
  const perishability={Vegetables:18,Fruit:15,Dairy:16,Protein:18,Grains:3,Pantry:2,Other:8}[item.category]||8;
  const storageAdj={Fridge:-5,Freezer:-22,Pantry:2,Counter:8}[item.storage]||0;
  let score=Math.round(88 - d*9 + perishability + storageAdj);
  if(d===0) score=96;
  score=Math.max(4,Math.min(99,score));
  const level=score>=70?"high":score>=40?"medium":"low";
  return {score,level,label:level==="high"?"High":level==="medium"?"Medium":"Low"};
}

function renderInventory(){
  const allRisks=inventory.map(predictRisk);
  const highCount=allRisks.filter(r=>r.level==="high").length, mediumCount=allRisks.filter(r=>r.level==="medium").length;
  const avgRisk=allRisks.length?Math.round(allRisks.reduce((a,r)=>a+r.score,0)/allRisks.length):0;
  if($("#riskHighCount")){ $("#riskHighCount").textContent=highCount; $("#riskMediumCount").textContent=mediumCount; $("#riskAverage").textContent=`${avgRisk}%`; }
  const q=$("#inventorySearch").value.toLowerCase(), cat=$("#categoryFilter").value, st=$("#statusFilter").value, sort=$("#sortFilter").value;
  let items=inventory.filter(i=>(!q||i.name.toLowerCase().includes(q))&&(cat==="all"||i.category===cat)&&(st==="all"||statusOf(i)===st));
  items.sort(sort==="name"?(a,b)=>a.name.localeCompare(b.name):sort==="qty"?(a,b)=>b.qty-a.qty:(a,b)=>new Date(a.expiry)-new Date(b.expiry));
  $("#inventoryTableBody").innerHTML=items.map(i=>{
    const risk=predictRisk(i);
    return `<tr>
      <td><div class="ingredient-cell"><span class="food-icon">${i.emoji||getEmoji(i.name)}</span><div><strong>${i.name}</strong><small style="display:block;color:#81908a">${i.category}</small></div></div></td>
      <td>${i.qty} ${i.unit}</td><td>${i.storage}</td><td>${new Date(i.expiry+"T00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"})}</td>
      <td><span class="status-${statusOf(i)}"><i class="status-dot"></i>${statusOf(i)==="soon"?"Use soon":statusOf(i)[0].toUpperCase()+statusOf(i).slice(1)}</span></td>
      <td><span class="risk-chip risk-${risk.level}">${risk.score}% ${risk.label}</span></td>
      <td><div class="table-actions"><button title="Edit" data-edit="${i.id}">✎</button><button title="Delete" data-delete="${i.id}">×</button></div></td>
    </tr>`;
  }).join("") || `<tr><td colspan="7">No matching items.</td></tr>`;
  $$('[data-edit]').forEach(b=>b.onclick=()=>openItemModal(Number(b.dataset.edit)));
  $$('[data-delete]').forEach(b=>b.onclick=()=>{inventory=inventory.filter(i=>i.id!==Number(b.dataset.delete));save();renderAll();toast("Item removed");});
}

function likelyReceiptItem(line){
  const bad=/^(total|subtotal|tax|cash|visa|mastercard|change|thank|date|time|receipt|fresh market|store|tel|phone|balance|amount|card|payment)/i;
  if(!line || line.length<2 || bad.test(line.trim())) return false;
  if(/^[-=_*\s]+$/.test(line)) return false;
  return /[a-z]/i.test(line);
}
function cleanReceiptName(line){
  let clean=line.replace(/\s+[.$€£]?\d+[.,]\d{2}\s*$/g,"")
                .replace(/[.$€£]\s?\d+([.,]\d+)?/g,"")
                .replace(/\.{2,}\s*\d+([.,]\d+)?/g,"")
                .replace(/\s{2,}/g," ").trim();
  clean=clean.replace(/^\d+\s*[xX]\s*/,"");
  const name=clean.replace(/\b\d+(\.\d+)?\s*(kg|g|l|ml|pcs|pc|pk|pack|bag|x)?\b/ig,"").replace(/\bx\d+\b/ig,"").trim();
  return name.replace(/[^a-zA-ZÀ-ÿ&' -]/g,"").trim();
}
function parseReceipt(){
  const text=$("#receiptText").value.trim();
  if(!text){toast("Paste, type, or OCR a receipt first");return}
  const shelf={milk:5,spinach:4,banana:5,egg:21,bread:6,tomato:7,yogurt:7,mushroom:5,carrot:14,cheese:12,apple:14,chicken:3,fish:2,lettuce:5,pepper:7,onion:21,lemon:21,oat:120,rice:180};
  const rows=text.split(/\n/).map(x=>x.trim()).filter(likelyReceiptItem);
  const results=rows.map((line,idx)=>{
    const nums=line.match(/\b\d+(\.\d+)?\b/g);
    let qty=1;
    if(nums && !/[.$€£]\s?\d+[.,]\d{2}/.test(line)) qty=Math.max(1,Number(nums[0])||1);
    const name=cleanReceiptName(line);
    const key=Object.keys(shelf).find(k=>name.toLowerCase().includes(k));
    return {id:Date.now()+idx,name:name||line,qty,days:key?shelf[key]:10,checked:true};
  }).filter(r=>r.name.length>1);
  if(!results.length){toast("No grocery-like lines detected. You can edit the text and retry.");return}
  $("#scanResults").dataset.items=JSON.stringify(results);
  $("#scanResults").innerHTML=results.map((r,i)=>`<div class="scan-result"><label><input type="checkbox" data-scan-check="${i}" checked> <b>${r.name}</b></label><small>${r.qty} • ~${r.days}d shelf life</small></div>`).join("")+
    `<button class="primary-btn full" id="importScanBtn">Add selected to inventory</button>`;
  $("#importScanBtn").onclick=()=>{
    const data=JSON.parse($("#scanResults").dataset.items||"[]");
    const checked=$$('[data-scan-check]').filter(c=>c.checked).map(c=>Number(c.dataset.scanCheck));
    checked.forEach(i=>{
      const r=data[i]; inventory.push({id:Date.now()+Math.random(),name:r.name,category:guessCategory(r.name),qty:r.qty,unit:"pcs",storage:guessStorage(r.name),expiry:offsetDate(r.days),emoji:getEmoji(r.name)});
    });
    save();renderAll();toast(`${checked.length} item${checked.length===1?"":"s"} added`);go("inventory");
  };
}

let receiptImageFile=null;
$("#receiptImageInput").addEventListener("change",e=>{
  receiptImageFile=e.target.files?.[0]||null;
  if(!receiptImageFile) return;
  const url=URL.createObjectURL(receiptImageFile);
  $("#receiptPreview").src=url; $("#receiptPreview").hidden=false; $("#demoReceiptPaper").hidden=true;
  toast("Receipt image ready for OCR");
});
$("#ocrScanBtn").addEventListener("click",async()=>{
  if(!receiptImageFile){toast("Choose or capture a receipt image first");return}
  const progress=$("#ocrProgress"), bar=$("#ocrProgressBar"), label=$("#ocrProgressText");
  progress.hidden=false; bar.style.width="2%"; label.textContent="Loading OCR…";
  try{
    const TesseractApi=await ensureTesseract();
    label.textContent="Preparing OCR…";
    const result=await TesseractApi.recognize(receiptImageFile,"eng",{logger:m=>{
      if(m.status){ const pct=m.progress?Math.round(m.progress*100):5; bar.style.width=`${Math.max(5,pct)}%`; label.textContent=`${m.status}${m.progress?` • ${pct}%`:""}`; }
    }});
    $("#receiptText").value=result.data.text.trim(); bar.style.width="100%"; label.textContent="OCR complete — reviewing grocery lines";
    parseReceipt(); toast("Receipt text extracted");
  }catch(err){ console.error(err); label.textContent="OCR failed — manual entry is still available"; toast("Could not read that image. Try a clearer photo."); }
});

function synthesizeLocalRecipe(){
  const max=Number($("#recipeTime").value), diet=$("#recipeDiet").value, servings=Number($("#recipeServings").value), prompt=$("#recipePrompt").value.trim();
  const ranked=[...inventory].sort((a,b)=>predictRisk(b).score-predictRisk(a).score);
  const veganBad=/egg|milk|yogurt|cheese|chicken|fish|meat/i;
  const vegBad=/chicken|fish|meat/i;
  let usable=ranked.filter(i=>diet!=="vegan"||!veganBad.test(i.name)).filter(i=>diet!=="vegetarian"||!vegBad.test(i.name));
  usable=usable.slice(0,Math.min(5,Math.max(3,usable.length)));
  if(!usable.length){toast("Add a few pantry items first");return}
  const names=usable.map(i=>i.name), main=names[0], second=names[1]||"pantry vegetables";
  const style=/spicy/i.test(prompt)?"Spicy":/light|salad/i.test(prompt)?"Fresh":/one[- ]?pan/i.test(prompt)?"One-Pan":/breakfast/i.test(prompt)?"Breakfast":"Rescue";
  const title=`${style} ${main} & ${second} Bowl`;
  const baseTime=Math.min(max,Math.max(12,18+usable.length*2));
  const steps=[
    `Prep ${names.slice(0,3).join(", ")} and portion for ${servings} serving${servings>1?"s":""}.`,
    `Start with the firmest ingredients; cook gently for about ${Math.max(5,baseTime-10)} minutes.`,
    `Add the most perishable ingredient (${main}) near the end so texture and freshness are preserved.`,
    `Season from pantry basics, taste, and finish with any herbs, citrus, or yogurt already available.`,
    `Cool leftovers quickly and store them for the next meal to keep this recipe zero-waste.`
  ];
  const avgRisk=Math.round(usable.reduce((a,i)=>a+predictRisk(i).score,0)/usable.length);
  $("#synthesizedRecipe").innerHTML=`<div class="synth-card"><div class="synth-icon">${getEmoji(main)}</div><div><h3>${title}</h3><p>${prompt?`Built around “${prompt}” while prioritizing high-risk food.`:"Built around the ingredients most likely to be wasted first."}</p><div class="synth-meta"><span>⏱ ${baseTime} min</span><span>🍽 ${servings} serving${servings>1?"s":""}</span><span>⚠ ${avgRisk}% avg. waste risk</span><span>♻ ${usable.length} pantry items</span></div><b>Uses:</b> ${names.join(", ")}<ol class="synth-steps">${steps.map(x=>`<li>${x}</li>`).join("")}</ol><div class="synth-actions"><button class="primary-btn" id="markSynthCooked">Mark as planned</button><button class="ghost-btn" id="synthShopping">Check missing basics</button></div></div></div>`;
  $("#markSynthCooked").onclick=()=>toast("Meal plan saved locally for this session");
  $("#synthShopping").onclick=()=>{
    const basics=["Garlic","Olive oil"];
    let added=0; basics.forEach(x=>{if(!inventory.some(i=>i.name.toLowerCase().includes(x.toLowerCase()))&&!shopping.some(s=>s.name===x)){shopping.push({id:Date.now()+Math.random(),name:x,qty:"1",checked:false});added++;}});
    save();renderShopping();renderDashboard();toast(added?`${added} optional basic${added>1?"s":""} added to shopping list`:"You already have the suggested basics");
  };
}
$("#synthesizeRecipeBtn").addEventListener("click",synthesizeLocalRecipe);

function renderWaste(){
  const amount=waste.reduce((a,b)=>a+b.amount,0), cost=waste.reduce((a,b)=>a+b.cost,0);
  $("#wasteMonth").textContent=`${amount.toFixed(1)} kg`;$("#wasteCost").textContent=`$${cost.toFixed(2)}`;
  const reasons={}; waste.forEach(w=>reasons[w.reason]=(reasons[w.reason]||0)+w.amount);
  const top=Object.entries(reasons).sort((a,b)=>b[1]-a[1])[0];$("#wasteReason").textContent=top?top[0]:"—";
  $("#wasteLog").innerHTML=waste.slice(0,8).map(w=>`<div class="activity-item"><div><strong>${w.item}</strong><small>${w.reason} • ${new Date(w.date+"T00:00").toLocaleDateString()}</small></div><b>${w.amount} kg</b></div>`).join("");
  const max=Math.max(...Object.values(reasons),1);
  $("#wasteReasonBars").innerHTML=Object.entries(reasons).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="category-row"><span>${k}</span><div class="category-track"><span style="width:${v/max*100}%"></span></div><b>${v.toFixed(1)}</b></div>`).join("");
  const high=inventory.filter(i=>predictRisk(i).score>=70).sort((a,b)=>predictRisk(b).score-predictRisk(a).score);
  const recs=[];
  if(high[0]) recs.push({n:"01",title:`Use ${high[0].name} first`,desc:`Predicted waste risk is ${predictRisk(high[0]).score}%. Generate a rescue recipe now.`,jump:"recipes"});
  if(top) recs.push({n:"02",title:`Reduce “${top[0]}” waste`,desc:`This is your largest logged waste cause. Plan a visible use-first zone or smaller portions.`,jump:"inventory"});
  recs.push({n:"03",title:"Shop from the pantry gap",desc:"Check current stock before buying duplicates and keep the shopping list synchronized.",jump:"shopping"});
  $("#wasteRecommendations").innerHTML=recs.map(r=>`<button data-smart-jump="${r.jump}"><span>${r.n}</span><div><b>${r.title}</b><small>${r.desc}</small></div>→</button>`).join("");
  $$('[data-smart-jump]').forEach(b=>b.onclick=()=>go(b.dataset.smartJump));
}

function renderInsights(){
  const high=inventory.filter(i=>predictRisk(i).score>=70).length;
  const rescueRate=inventory.length?Math.round((inventory.length-high)/inventory.length*100):100;
  const totalWaste=waste.reduce((a,b)=>a+b.amount,0);
  const oldest=waste.length?Math.min(...waste.map(w=>new Date(w.date+"T00:00").getTime())):Date.now();
  const spanDays=Math.max(7,Math.ceil((Date.now()-oldest)/DAY)+1);
  const projected=totalWaste/spanDays*30;
  $("#insightRescueRate").textContent=`${rescueRate}%`;$("#insightHighRisk").textContent=high;$("#insightProjectedWaste").textContent=`${projected.toFixed(1)} kg`;
  const labels=[],vals=[];
  for(let d=6;d>=0;d--){ const date=offsetDate(-d); labels.push(new Date(date+"T00:00").toLocaleDateString(undefined,{weekday:"short"})); vals.push(waste.filter(w=>w.date===date).reduce((a,b)=>a+b.amount,0)); }
  const max=Math.max(...vals,.1);
  $("#rescueChart").innerHTML=vals.map((v,i)=>`<div class="chart-col"><b>${v?v.toFixed(1)+"kg":"—"}</b><div class="chart-bar" style="height:${Math.max(3,v/max*82)}%"></div><small>${labels[i]}</small></div>`).join("");
}

const originalRenderDashboard=renderDashboard;
renderDashboard=function(){
  originalRenderDashboard();
  const high=inventory.filter(i=>predictRisk(i).score>=70).length;
  $("#heroUrgentCount").textContent=`${high} high-risk item${high===1?"":"s"}`;
};

// Rebind handlers that now use upgraded implementations.
$("#parseReceiptBtn").onclick=parseReceipt;
$("#demoScanBtn").onclick=()=>{
  $("#receiptPreview").hidden=true; $("#demoReceiptPaper").hidden=false;
  $("#receiptText").value="Milk 1L\nSpinach 1 bag\nBananas 6\nEggs 12\nBread 1 pack";
  parseReceipt();
};

renderAll();


// ===== PantryLoop V4: Firebase Auth + per-user Firestore sync =====
(() => {
  const SIDEBAR_KEY="pantryloop_sidebar_collapsed";
  const TRASH_ICON=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 10v6M14 10v6"></path></svg>`;
  const loginScreen=$("#loginScreen"),appShell=$("#appShell"),loginForm=$("#loginForm"),signupForm=$("#signupForm");
  const authSuccess=$("#authSuccess"),firebaseSetupMessage=$("#firebaseSetupMessage");
  let currentUserProfile=null,pendingDeleteAction=null,pendingAvatarFile=null,removeAvatarRequested=false,signupInProgress=false;
  if(!firebaseConfigured) firebaseSetupMessage.hidden=false;

  const initials=name=>{const p=String(name||"Pantry User").trim().split(/\s+/).filter(Boolean);return((p[0]?.[0]||"P")+(p.length>1?(p[p.length-1]?.[0]||""):"")).toUpperCase();};
  function setAvatar(el,name,url){if(!el)return;if(url){el.textContent="";el.style.backgroundImage=`url("${String(url).replace(/"/g,"%22")}")`;el.classList.add("has-photo");}else{el.style.backgroundImage="";el.classList.remove("has-photo");el.textContent=initials(name);}}
  function authErrorMessage(err){
    const m={
      "auth/email-already-in-use":"An account already exists with this email. Go back to Sign in and use that account.",
      "auth/invalid-email":"Enter a valid email address.",
      "auth/weak-password":"Use a password with at least 6 characters.",
      "auth/invalid-credential":"Email or password is incorrect.",
      "auth/user-disabled":"This account has been disabled.",
      "auth/too-many-requests":"Too many attempts. Please wait and try again.",
      "auth/network-request-failed":"Network error. Check your internet connection.",
      "auth/requires-recent-login":"Please sign out and sign in again before changing the account email.",
      "auth/operation-not-allowed":"Email/Password sign-in is not enabled yet. Firebase Console → Authentication → Sign-in method → enable Email/Password.",
      "auth/configuration-not-found":"Firebase Authentication is not configured for this project yet. Enable Authentication and Email/Password in Firebase Console.",
      "auth/unauthorized-domain":"This website domain is not authorized. Firebase Console → Authentication → Settings → Authorized domains, then add this domain (or localhost for local testing).",
      "permission-denied":"Firestore blocked this request. Create Firestore and publish the included firestore.rules.",
      "failed-precondition":"Cloud Firestore is not ready. Create the Firestore database in Firebase Console, then publish the included rules.",
      "storage/unauthorized":"Profile photo upload is blocked by Firebase Storage rules.",
      "storage/quota-exceeded":"Firebase Storage is unavailable. Check the Storage billing/bucket setup."
    };
    return m[err?.code]||String(err?.message||"Something went wrong. Please try again.").replace(/^Firebase:\s*/,"");
  }
  const currentView=()=>$(".view.active")?.id?.replace(/View$/,'')||"dashboard";
  function updatePageTitle(view=currentView()){const first=(currentUserProfile?.name||auth?.currentUser?.displayName||"there").split(/\s+/)[0];const titles={dashboard:`Good evening, ${first} 👋`,inventory:"Kitchen inventory",scanner:"Receipt scanner",recipes:"Recipe synthesizer",shopping:"Shopping list",waste:"Waste tracker",insights:"Insights"};if($("#pageTitle"))$("#pageTitle").textContent=titles[view]||"PantryLoop";}
  function updateUserUI(){const u=auth?.currentUser;if(!u)return;const name=currentUserProfile?.name||u.displayName||"Pantry User",email=currentUserProfile?.email||u.email||"",photo=currentUserProfile?.photoURL||u.photoURL||"";$("#profileName").textContent=name;$("#profileEmail").textContent=email;$("#profileMenuName").textContent=name;$("#profileMenuEmail").textContent=email;setAvatar($("#profileAvatar"),name,photo);updatePageTitle();}
  function showLogin(){loginScreen.hidden=false;appShell.hidden=true;document.body.classList.add("login-active");$("#profileMenu").hidden=true;$("#notificationPanel").hidden=true;setTimeout(()=>$("#loginEmail")?.focus(),0);}
  function showApp(){loginScreen.hidden=true;appShell.hidden=false;document.body.classList.remove("login-active");updateUserUI();renderNotifications();}
  function setAuthMode(mode,msg=""){const su=mode==="signup";loginForm.hidden=su;signupForm.hidden=!su;$("#authKicker").textContent=su?"NEW ACCOUNT":"WELCOME BACK";$("#authTitle").textContent=su?"Create your PantryLoop account":"Sign in to PantryLoop";$("#authSubtitle").textContent=su?"Create a private account so your pantry, shopping, waste and profile data stay connected to you.":"Access your private pantry workspace and continue from where you left off.";authSuccess.hidden=!msg;authSuccess.textContent=msg;$("#loginError").hidden=true;$("#signupError").hidden=true;setTimeout(()=>$(su?"#signupName":"#loginEmail")?.focus(),0);}
  $("#showSignupBtn").onclick=()=>setAuthMode("signup");$("#showSigninBtn").onclick=()=>setAuthMode("signin");
  window.__pantryAuthReady=true;
  function bindToggle(btn,input){$(btn).onclick=()=>{const i=$(input),show=i.type==="text";i.type=show?"password":"text";$(btn).textContent=show?"Show":"Hide";};}
  bindToggle("#togglePassword","#loginPassword");bindToggle("#toggleSignupPassword","#signupPassword");bindToggle("#toggleSignupConfirmPassword","#signupConfirmPassword");

  loginForm.addEventListener("submit",async e=>{e.preventDefault();const email=$("#loginEmail").value.trim(),password=$("#loginPassword").value,error=$("#loginError"),submit=$("#loginSubmit");error.hidden=true;authSuccess.hidden=true;if(!firebaseConfigured){error.textContent="Firebase is not configured. Add your project values in firebase-config.js first.";error.hidden=false;return;}if(!/^\S+@\S+\.\S+$/.test(email)){error.textContent="Enter a valid email address.";error.hidden=false;return;}if(password.length<6){error.textContent="Password must contain at least 6 characters.";error.hidden=false;return;}submit.disabled=true;submit.textContent="Signing in…";try{await setPersistence(auth,$("#rememberMe").checked?browserLocalPersistence:browserSessionPersistence);await signInWithEmailAndPassword(auth,email,password);}catch(err){error.textContent=authErrorMessage(err);error.hidden=false;}finally{submit.disabled=false;submit.textContent="Sign in";}});

  signupForm.addEventListener("submit",async e=>{
    e.preventDefault();
    const name=$("#signupName").value.trim(),email=$("#signupEmail").value.trim(),password=$("#signupPassword").value,confirm=$("#signupConfirmPassword").value,error=$("#signupError"),submit=$("#signupSubmit");
    error.hidden=true;authSuccess.hidden=true;
    if(!firebaseConfigured){error.textContent="Firebase is not configured. Add your project values in firebase-config.js first.";error.hidden=false;return;}
    if(name.length<2){error.textContent="Enter your full name.";error.hidden=false;return;}
    if(!/^\S+@\S+\.\S+$/.test(email)){error.textContent="Enter a valid email address.";error.hidden=false;return;}
    if(password.length<6){error.textContent="Password must contain at least 6 characters.";error.hidden=false;return;}
    if(password!==confirm){error.textContent="Passwords do not match.";error.hidden=false;return;}
    submit.disabled=true;submit.textContent="Creating account…";signupInProgress=true;
    let createdUser=null;
    try{
      const c=await createUserWithEmailAndPassword(auth,email,password);
      createdUser=c.user;
      await updateProfile(c.user,{displayName:name});
      let cloudSetupError=null;
      try{
        await setDoc(doc(db,"users",c.user.uid),{name,email,photoURL:"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
        await setDoc(doc(db,"users",c.user.uid,"private","state"),{inventory:[],shopping:[],waste:[],readNotifications:[],schemaVersion:1,updatedAt:serverTimestamp()},{merge:true});
      }catch(cloudErr){cloudSetupError=cloudErr;console.error("Initial Firestore setup failed:",cloudErr);}
      await signOut(auth);
      signupForm.reset();$("#loginEmail").value=email;
      if(cloudSetupError){
        setAuthMode("signin","Your Firebase Auth account was created. Before signing in, finish Firestore setup so your private data can sync.");
        const le=$("#loginError");le.textContent=authErrorMessage(cloudSetupError);le.hidden=false;
      }else{
        setAuthMode("signin","Account created successfully. Sign in with your email and password.");
      }
    }catch(err){
      try{if(auth?.currentUser)await signOut(auth);}catch{}
      error.textContent=authErrorMessage(err);error.hidden=false;
    }finally{signupInProgress=false;submit.disabled=false;submit.textContent="Create account";}
  });

  $("#forgotPasswordBtn").onclick=async()=>{const email=$("#loginEmail").value.trim(),error=$("#loginError");error.hidden=true;authSuccess.hidden=true;if(!firebaseConfigured){error.textContent="Firebase is not configured yet.";error.hidden=false;return;}if(!/^\S+@\S+\.\S+$/.test(email)){error.textContent="Enter your email first, then choose Forgot password.";error.hidden=false;return;}try{await sendPasswordResetEmail(auth,email);authSuccess.textContent="Password reset email sent. Check your inbox.";authSuccess.hidden=false;}catch(err){error.textContent=authErrorMessage(err);error.hidden=false;}};

  async function loadProfile(u){let p={name:u.displayName||"Pantry User",email:u.email||"",photoURL:u.photoURL||""};try{const s=await getDoc(doc(db,"users",u.uid));if(s.exists())p={...p,...s.data()};else await setDoc(doc(db,"users",u.uid),{...p,createdAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});}catch(err){console.error("Profile load failed:",err);}currentUserProfile=p;return p;}
  async function handleSignedInUser(u){await loadProfile(u);await loadUserState(u.uid);showApp();go("dashboard");}
  if(firebaseConfigured){
    onAuthStateChanged(auth,async u=>{
      if(signupInProgress)return;
      if(u){
        try{
          await handleSignedInUser(u);
        }catch(err){
          console.error("Signed in but private Firestore state could not load:",err);
          try{await signOut(auth);}catch{}
          showLogin();
          const le=$("#loginError");
          le.textContent=`Sign-in succeeded, but your private cloud workspace is not ready. ${authErrorMessage(err)}`;
          le.hidden=false;
        }
      }else{
        clearTimeout(cloudSaveTimer);activeUid=null;applyState({});currentUserProfile=null;showLogin();
      }
    });
  }else showLogin();

  const legacyGo=go;go=function(view){legacyGo(view);updatePageTitle(view);};

  const profileButton=$("#profileButton"),profileMenu=$("#profileMenu");
  profileButton.onclick=e=>{e.stopPropagation();$("#notificationPanel").hidden=true;$("#notificationBtn").setAttribute("aria-expanded","false");profileMenu.hidden=!profileMenu.hidden;profileButton.setAttribute("aria-expanded",String(!profileMenu.hidden));};
  function refreshAccountPreview(){const name=$("#accountName").value.trim()||currentUserProfile?.name||"Pantry User";let url=currentUserProfile?.photoURL||"";if(removeAvatarRequested)url="";if(pendingAvatarFile)url=URL.createObjectURL(pendingAvatarFile);setAvatar($("#accountAvatarPreview"),name,url);}
  $("#accountSettingsBtn").onclick=()=>{profileMenu.hidden=true;profileButton.setAttribute("aria-expanded","false");$("#accountName").value=currentUserProfile?.name||auth?.currentUser?.displayName||"";$("#accountEmail").value=currentUserProfile?.email||auth?.currentUser?.email||"";pendingAvatarFile=null;removeAvatarRequested=false;refreshAccountPreview();$("#accountModalBackdrop").hidden=false;};
  $("#accountName").addEventListener("input",refreshAccountPreview);
  $("#accountAvatarInput").addEventListener("change",e=>{const f=e.target.files?.[0]||null;if(!f)return;if(!/^image\/(jpeg|png|webp)$/.test(f.type)){toast("Choose a JPG, PNG, or WebP image");e.target.value="";return;}if(f.size>2*1024*1024){toast("Profile photo must be 2 MB or smaller");e.target.value="";return;}pendingAvatarFile=f;removeAvatarRequested=false;refreshAccountPreview();});
  $("#removeAccountAvatar").onclick=()=>{pendingAvatarFile=null;removeAvatarRequested=true;$("#accountAvatarInput").value="";refreshAccountPreview();};
  const closeAccount=()=>{pendingAvatarFile=null;removeAvatarRequested=false;$("#accountAvatarInput").value="";$("#accountModalBackdrop").hidden=true;};$("#accountModalClose").onclick=$("#cancelAccountModal").onclick=closeAccount;
  $("#accountForm").onsubmit=async e=>{e.preventDefault();const u=auth?.currentUser;if(!u)return;const name=$("#accountName").value.trim(),email=$("#accountEmail").value.trim(),submit=e.submitter;if(!name||!/^\S+@\S+\.\S+$/.test(email)){toast("Enter a valid name and email");return;}if(submit){submit.disabled=true;submit.textContent="Saving…";}try{let photo=currentUserProfile?.photoURL||u.photoURL||"";const ar=storageRef(storage,`users/${u.uid}/profile/avatar`);if(removeAvatarRequested){try{await deleteObject(ar);}catch(err){if(err?.code!=="storage/object-not-found")throw err;}photo="";}else if(pendingAvatarFile){await uploadBytes(ar,pendingAvatarFile,{contentType:pendingAvatarFile.type});photo=await getDownloadURL(ar);}if(u.displayName!==name||(u.photoURL||"")!==photo)await updateProfile(u,{displayName:name,photoURL:photo||null});if(u.email!==email)await updateEmail(u,email);currentUserProfile={name,email:u.email||email,photoURL:photo};await setDoc(doc(db,"users",u.uid),{...currentUserProfile,updatedAt:serverTimestamp()},{merge:true});updateUserUI();closeAccount();toast("Account settings saved");}catch(err){console.error(err);toast(authErrorMessage(err));}finally{if(submit){submit.disabled=false;submit.textContent="Save changes";}}};
  $("#logoutBtn").onclick=async()=>{profileMenu.hidden=true;try{await writeStateToFirestore();await signOut(auth);}catch(err){toast(authErrorMessage(err));}};

  const menuBtn=$("#mobileMenu"),sidebar=$("#sidebar");
  const applySidebarState=c=>{if(innerWidth>=780){appShell.classList.toggle("sidebar-collapsed",c);menuBtn.setAttribute("aria-expanded",String(!c));}else{appShell.classList.remove("sidebar-collapsed");menuBtn.setAttribute("aria-expanded",String(sidebar.classList.contains("open")));}};
  applySidebarState(localStorage.getItem(SIDEBAR_KEY)==="1");
  menuBtn.addEventListener("click",e=>{if(innerWidth>=780){e.preventDefault();e.stopImmediatePropagation();const c=!appShell.classList.contains("sidebar-collapsed");appShell.classList.toggle("sidebar-collapsed",c);localStorage.setItem(SIDEBAR_KEY,c?"1":"0");menuBtn.setAttribute("aria-expanded",String(!c));}},true);
  menuBtn.addEventListener("click",()=>{if(innerWidth<780)setTimeout(()=>menuBtn.setAttribute("aria-expanded",String(sidebar.classList.contains("open"))),0);});window.addEventListener("resize",()=>applySidebarState(localStorage.getItem(SIDEBAR_KEY)==="1"));$$(".nav-item").forEach(i=>i.title=i.querySelector("span:not(.icon)")?.textContent||"");

  function notificationData(){return[...inventory].map(i=>({item:i,status:statusOf(i),days:daysLeft(i.expiry),risk:typeof predictRisk==="function"?predictRisk(i):null})).filter(x=>x.status!=="fresh"||(x.risk&&x.risk.score>=70)).sort((a,b)=>a.days-b.days).slice(0,8).map(x=>({id:`inventory-${x.item.id}-${x.status}`,title:x.status==="expired"?`${x.item.name} has expired`:`${x.item.name} needs attention`,message:x.status==="expired"?"Review this item and remove or log waste if needed.":`${expiryText(x.item)} remaining${x.risk?` • ${x.risk.score}% waste risk`:""}.`,time:x.status==="expired"?`${Math.abs(x.days)}d overdue`:x.days===0?"Today":x.days===1?"Tomorrow":`In ${x.days} days`}));}
  const storeRead=ids=>{readNotifications=[...new Set(ids)];save();};
  function renderNotifications(){const list=notificationData(),read=readNotifications,unread=list.filter(n=>!read.includes(n.id)).length,b=$("#notificationBadge");b.textContent=unread>9?"9+":String(unread);b.hidden=unread===0;$("#notificationList").innerHTML=list.length?list.map(n=>`<button class="notification-item ${read.includes(n.id)?"":"unread"}" data-notification-id="${n.id}"><span class="notification-status"></span><div><strong>${n.title}</strong><p>${n.message}</p></div><time>${n.time}</time></button>`).join(""):`<div class="notification-empty"><strong>You're all caught up</strong><span>No pantry alerts need attention right now.</span></div>`;$$("[data-notification-id]").forEach(btn=>btn.onclick=()=>{storeRead([...readNotifications,btn.dataset.notificationId]);renderNotifications();$("#notificationPanel").hidden=true;$("#notificationBtn").setAttribute("aria-expanded","false");go("inventory");});}
  const notificationBtn=$("#notificationBtn"),notificationPanel=$("#notificationPanel");notificationBtn.onclick=e=>{e.stopPropagation();profileMenu.hidden=true;profileButton.setAttribute("aria-expanded","false");renderNotifications();notificationPanel.hidden=!notificationPanel.hidden;notificationBtn.setAttribute("aria-expanded",String(!notificationPanel.hidden));};$("#markAllReadBtn").onclick=e=>{e.stopPropagation();storeRead(notificationData().map(n=>n.id));renderNotifications();};$("#viewInventoryAlertsBtn").onclick=()=>{notificationPanel.hidden=true;notificationBtn.setAttribute("aria-expanded","false");go("inventory");};

  function requestDelete(title,message,action){pendingDeleteAction=action;$("#deleteModalTitle").textContent=title;$("#deleteModalMessage").textContent=message;$("#deleteModalBackdrop").hidden=false;setTimeout(()=>$("#confirmDeleteBtn").focus(),0);}function closeDelete(){pendingDeleteAction=null;$("#deleteModalBackdrop").hidden=true;}$("#cancelDeleteBtn").onclick=closeDelete;$("#confirmDeleteBtn").onclick=()=>{const a=pendingDeleteAction;closeDelete();if(a)a();};$("#deleteModalBackdrop").addEventListener("click",e=>{if(e.target.id==="deleteModalBackdrop")closeDelete();});
  function enhanceDeleteButtons(){$$("[data-delete]").forEach(btn=>{btn.classList.add("delete-icon-btn");btn.innerHTML=TRASH_ICON;btn.setAttribute("aria-label","Delete inventory item");btn.onclick=()=>{const id=Number(btn.dataset.delete),item=inventory.find(i=>i.id===id);requestDelete("Delete pantry item?",`Remove ${item?.name||"this item"} from your inventory?`,()=>{inventory=inventory.filter(i=>i.id!==id);save();renderAll();toast("Item removed");});};});$$("[data-shop-delete]").forEach(btn=>{btn.classList.add("delete-icon-btn");btn.innerHTML=TRASH_ICON;btn.setAttribute("aria-label","Delete shopping-list item");btn.onclick=()=>{const id=String(btn.dataset.shopDelete),item=shopping.find(s=>String(s.id)===id);requestDelete("Delete shopping item?",`Remove ${item?.name||"this item"} from your shopping list?`,()=>{shopping=shopping.filter(s=>String(s.id)!==id);save();renderShopping();renderDashboard();renderNotifications();toast("Shopping item removed");});};});}
  const legacyRenderInventory=renderInventory;renderInventory=function(){legacyRenderInventory();enhanceDeleteButtons();};const legacyRenderShopping=renderShopping;renderShopping=function(){legacyRenderShopping();enhanceDeleteButtons();};const legacyRenderAll=renderAll;renderAll=function(){legacyRenderAll();enhanceDeleteButtons();renderNotifications();updatePageTitle();};
  document.addEventListener("click",e=>{if(!e.target.closest(".notification-area")){notificationPanel.hidden=true;notificationBtn.setAttribute("aria-expanded","false");}if(!e.target.closest(".profile-area")){profileMenu.hidden=true;profileButton.setAttribute("aria-expanded","false");}});document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;notificationPanel.hidden=true;profileMenu.hidden=true;notificationBtn.setAttribute("aria-expanded","false");profileButton.setAttribute("aria-expanded","false");if(!$("#deleteModalBackdrop").hidden)closeDelete();if(!$("#accountModalBackdrop").hidden)closeAccount();});$("#accountModalBackdrop").addEventListener("click",e=>{if(e.target.id==="accountModalBackdrop")closeAccount();});
  renderAll();
})();
