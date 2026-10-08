//globals
const apiurl = "https://api.collection.nfsa.gov.au/search";
const imgurl =  "https://media.nfsacollection.net/";

//decades array - no 1890 or 2020 because there are no items in the collection with images
const decades = [1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010];

//get page address values
const params = new URLSearchParams(window.location.search);
const decade = Number(params.get("decade"));
const type = params.get("type");
const title = params.get("title");

//24 items shown on collection page at a time
const limit = 24;

//changing variables
let titles = [];
let titleShown = 0;


//message function to show state based messages inside element
function message(element, text) {
  element.innerHTML = `<p class="message">${text}</p>`;
}


//function showing error/error message and log to console
function showError(element, error) {
  console.error("Error:", error);
  //error text
  message(element, "Oops! Something went wrong.");
}


//function to check whether image is from film or tv
//item = image record for NFSA collection
function getContentType(item) {

  //item medium type found in "subMedium"
  if(item.parentVersion?.subMedium === "Film") return "film";
  if(item.parentVersion?.subMedium === "Television") return "tv";
  return "";
}

//return small thumbnail image and large image address
function getImage(item) {
  const image = (item.preview || []).find(media => media.type === "image");
  if (!image) return null;
  return {small: imgurl + (image.thumbnailFilePath || image.filePath), big: imgurl + image.filePath};
}


//function to fetch images from a decade and sort into film or tv
async function getItemImgs(year) {

  //caching - look for saved item data for faster loading times
  const loaded = localStorage.getItem("contents" + year);
  if (loaded) return JSON.parse(loaded);
  
  //web address to fetch
  const url = `${apiurl}?year=${year}-${year+9}&subMedium=Documentation&hasMedia=yes&limit=25`;
  const apiRes = await fetch(url + "&page=1");

  //error state
  if (!apiRes.ok) throw new Error(`Oops! Something went wrong. ${apiRes.status}`);
  
  const data = await apiRes.json();
  let results = data.results;

  //get other pages of results
  const totalPages = Math.ceil(data.meta.count.total / 25);

  //25 at a time to reduce server load
  for (let start=2; start <= totalPages; start += 25) {
    const requests = [];
    for (let page = start; page < start + 25 && page <= totalPages; page++) {
    requests.push(fetch(url + "&page=" + page));
   }
    //wait for the 25
    const pageRes = await Promise.all(requests);

    //add each page to a list for sorting images
    for (const result of pageRes) {
    if (!result.ok) throw new Error (`Oops! Something went wrong. ${result.status}`)
    const pageData = await result.json();
    results = results.concat(pageData.results); 
   }
  }

  //sort film vs tv imgs-creating an objetc with 2 lists
  const contents = {film:[], tv:[]};
  results.forEach(item => {

    const contentType = getContentType(item);
    const image = getImage(item);

    //only get film and tv images and skip content with no images
    if(contentType ==="" || !image) return;

    // add/find img titles to group imgs
    let content = contents[contentType].find(img => img.title === item.parentVersion.title);
    if (!content) {
      content = {title: item.parentVersion.title || "Unknown", year: item.productionDates?.[0]?.fromYear ?? 0, type:contentType, images:[]};
      contents[contentType].push(content);
    }
    //allow up to 5 images in item card
    if (content.images.length < 5) content.images.push(image);
  });

  //sort images by year with oldest first
  contents.film.sort((a,b) => a.year - b.year);
  contents.tv.sort((a, b) => a.year - b.year);

  //caching - save item data to load images faster
  localStorage.setItem("contents"+year, JSON.stringify(contents));
  return contents; 
}


//decade collection page
function collectionCard(content, year) {

  //includes image, title and year of item and link to itemcard page
  return `<a class="item-card" href="itemcard.html?decade=${year}&type=${content.type}&title=${encodeURIComponent(content.title)}">
  <span class="item-img"><img src="${content.images[0].small}" alt=""></span>
  <span class="item-title">${content.title.toLowerCase()} - ${content.year || "unknown"}</span>
  </a>`;
}


//homepage function
function showHomepage() {

  //run for each decade
  decades.forEach(async year => {

  //create channel card and link to each corresponding decade collection page
  const card = document.createElement("a");
  card.className = "decades";
  card.href = `channel.html?decade=${year}`;
  card.innerHTML = `<span class="channel-label">CH ${year}</span>
  <div class="ch-images"></div>
  <span class="item-count">Tune in to explore</span>`;
  
  //channel card in carousel
  document.getElementById("decadeCarousel").appendChild(card);

  //tv and film images on chanel card
  const imgDiv = card.querySelector(".ch-images");

  /*found that 1900s only has 1 img
  so just for that channel card, only display 1 img
  instead of completely removing it like the 1890s and 2020s*/
  const imgCount = year === 1900 ? 1:2;

  //loading state
  message(imgDiv, "Loading....");
  try {
    const loaded = localStorage.getItem("contents" + year);
    if (loaded) {
      const contents = JSON.parse(loaded);
      imgDiv.innerHTML="";

      //display first 2 images for each decade on channel card
      contents.film.concat(contents.tv).slice(0,imgCount).forEach(content => {
        imgDiv.innerHTML += `<span class="ch-img"><img src="${content.images[0].small}" alt=""></span>`;
      });

    //find 2 images if no saved data
    } else {
      imgDiv.innerHTML="";

      //look through 5 pages for safety
      for (let page=1; page<=5 && imgDiv.children.length < imgCount; page++) {
        const imgRes = await fetch(`${apiurl}?year=${year}-${year+9}&subMedium=Documentation&hasMedia=yes&limit=25&page=${page}`)
        if (!imgRes.ok) throw new Error(`Oops! Something went wrong. ${imgRes.status}` )
        const data = await imgRes.json();
        data.results.forEach(item => {
        const image = getImage(item);
        
        //add images to channel card
        if (getContentType(item) !== "" && image && imgDiv.children.length < imgCount){
        imgDiv.innerHTML += `<span class="ch-img"><img src="${image.small}" alt=""></span>`;
        }
      });
    }
  }
  }  catch (error) {
      showError(imgDiv, error);
  }
  });
}


//about page function
async function showAbout() {
  const nfsaText = document.getElementById("nfsaText");
  message(nfsaText, "Loading....");
  try {
    //find total film item count
    const filmRes= await fetch(`${apiurl}?subMedium=Film&limit=1`);
    if (!filmRes.ok) throw new Error(`Oops! Something went wrong. ${filmRes.status}`);
    const filmData = await filmRes.json();

    //find total tv item count
    const tvRes= await fetch(`${apiurl}?subMedium=Television&limit=1`);
    if (!tvRes.ok) throw new Error(`Oops! Something went wrong. ${tvRes.status}`);
    const tvData = await tvRes.json();
    
    //create paragraph and input totals
    nfsaText.innerHTML = `<p class="nfsa-desc">
      The NFSA collection holds audiovisual items of all kinds. It holds ${filmData.meta.count.total.toLocaleString()} items from films 
      and ${tvData.meta.count.total.toLocaleString()} items from TV. This project only uses items from the film and tv collection which contain images.</p>`;
    } catch (error) {
      showError(nfsaText, error);
    }
}

//film and tv collection card in channel page
function contentCard(label, titleType, list) {
  
  //empty state if film or tv list is empty
  if (list.length === 0) {
    return `<div class="type-card"><span class="type-name">${label}</span><span class="type-count">No items with images</span></div>`;
  }
  
  //building film and tv collection cards
  let images="";

  //show first 2 images in each list on film or tv collection card
  list.slice(0,2).forEach(content => {
    images += `<span class="type-img"><img src="${content.images[0].small}" alt=""></span>`;
  });

  //link to collection page
  return `<a class="type-card" href="collection.html?decade=${decade}&type=${titleType}">
  
  <!-- film or tv label -->
  <span class="type-name">${label}</span>

  <!-- 2 images in each card -->
  <div class="type-images">${images}</div>

  <!-- no. films and tv with images -->
  <span class="type-count">${list.length} with images</span></a>`;
}


//channel page function
async function showChannel() {
  const count = document.getElementById("count");
  const grid = document.getElementById("grid");
  
  //edge case - check decade in page address
  if (!decades.includes(decade)) {
    message(count,"Page not found.");
    return;
  }

  //previous and next decade buttons
  const i = decades.indexOf(decade);
  const prev = decades[i-1] || 2010;
  const next = decades[i+1] || 1900;
  
  document.getElementById("changeDecade").innerHTML = 

    //back to home btn
    `<a class="back-btn" href="index.html">&lsaquo; Back</a>

    <!-- prev btn -->
    <a class="cd-text" href="channel.html?decade=${prev}">${prev}</a><a class="cd-arrow" href="channel.html?decade=${prev}">&lsaquo;</a>
    
    <!-- decade title -->
    <h1 class="current-decade">${decade}s</h1>

    <!-- next btn -->
    <a class="cd-arrow" href="channel.html?decade=${next}">&rsaquo;</a><a class="cd-text" href="channel.html?decade=${next}">${next}</a>`;
  
    message(grid, "Loading....");
    try {
      const contents = await getItemImgs(decade);

      //film and tv with images count
      count.textContent=`The NFSA has images from ${contents.film.length} films and images from ${contents.tv.length} TV shows in the ${decade}s`;
      
      //film and tv cards
      grid.innerHTML=contentCard("Film", "film", contents.film) + contentCard("TV", "tv", contents.tv);
    } catch (error) {
    
    showError(grid, error);
  }
}


//show more items on collection page
function showMoreItems() {
  //show 24 titles then 24 more everytime more btn is clicked
  titles.slice(titleShown, titleShown + limit).forEach(content => {

    //create collection grid
    document.getElementById("itemGrid").innerHTML += collectionCard(content, decade);
  }); titleShown += limit;
  
  //hide more btn when all titles are shown
  document.getElementById("moreBtn").style.display = titleShown < titles.length ? "inline-block" : "none";
}


//more button on collection page
const moreBtn = document.getElementById("moreBtn");
//run showMoreItems function when clicked
if (moreBtn) moreBtn.addEventListener("click", showMoreItems);


//collection page function
async function showCollectionContent() {
  const stateMessage = document.getElementById("stateMessage");
  
  if (!decades.includes(decade) || (type !== "film" && type !== "tv")) {
    message(stateMessage, "Page not found.");
    return;
  }
  
  //medium type
  document.getElementById("typeTitle").textContent = type === "tv" ? "TV" : "Film"; 

  //back to channel page btn
  document.getElementById("changeDecade").innerHTML = `<a class="back-btn" href="channel.html?decade=${decade}">&lsaquo; Back</a>
  
  <!-- decade -->
  <h1 class="current-decade">${decade}s</h1>`;

  message(stateMessage, "Loading....");

  try {
    const contents = await getItemImgs(decade);

    //save film and tv list to titles
    titles = contents[type];
    stateMessage.innerHTML = "";
    
    //empty state
    if (titles.length === 0) message(stateMessage, "No information.");
    
    //input function to show first 24 items
    showMoreItems();
  } catch (error) {
    showError(stateMessage, error);
  }
}

//show content images and details, and similar content on item and random item page
async function showContent(itemBody, content, list, year) {

  //show all images for an item as thumbnail pictures that become big when clicked
  let thumbnails = "";
  content.images.forEach(image => {
    thumbnails += `<img class="item-thumbnail" src="${image.small}" alt="" onclick="document.getElementById('bigImage').src='${image.big}'">`;
  });

  //show the 3 next items in collection and create item cards
  let more = "";
  const index = list.indexOf(content);
  list.slice(index + 1, index + 4).forEach(other => {
    more += collectionCard(other, year);
  });
  
  //input cached data first and input loading message for extra details
  itemBody.innerHTML = `<div class="item-details">
  <div class="item-data">
  <p class="data-line title-case">${content.title.toLowerCase()} - ${content.year || "unknown"}</p>
  <p class="data-line">Type: ${content.type === "tv" ? "TV" : "Film"}</p>
  <div id="details"><p class="data-line">Loading....</p></div>
  <div class="thumbnails">${thumbnails}</div>
  </div>
  <div class="curitem-img"><img id="bigImage" src="${content.images[0].big}" alt=""></div>
  </div>
  <div class="similar-items">
  <h2>More from the ${year}s</h2>
  <div class="item-grid">${more || `<p class="message">No more items.</p>`}</div>
  </div>`;

  //search for film/tv extra details 
  const details = document.getElementById("details");
  try {
    const subMedium = content.type === "tv" ? "Television" : "Film";

    //search api by item title, if error - error state
    const titleRes = await fetch(`${apiurl}?query=${encodeURIComponent(content.title)}&subMedium=${subMedium}&limit=25`);
    if (!titleRes.ok) throw new Error(`Oops! Something went wrong. ${titleRes.status}`);
    const data = await titleRes.json();

    //get film/tv item with exact title, if error-error state
    const record = data.results.find(item => item.title === content.title);
    if (!record) {
      message(details, "No information.");
      return;
    } 

    //get director
    const director = record.credits?.find(credit => credit.role === "Director");
       
    //input extra item details
    details.innerHTML = `
    <p class="data-line title-case">Director: ${director?.name.toLowerCase() ?? "Unknown"}</p>
    <p class="data-line">NFSA ID: <a class="nfsa-link" href="https://collection.nfsa.gov.au/title/${record.id}" target="_blank" rel="noopener">${record.id}</a></p>
    <p class="data-line">${record.summary || "No information."}</p>`;
  } catch (error) {
      showError(details,error);
  }
}


//Item page function
async function showItem() {
  const itemBody = document.getElementById("itemBody");

  //edge case - check decade or type in page address
  if (!decades.includes(decade) || (type !== "film" && type !== "tv")) {
    message(itemBody, "Page not found.");
    return;
  }

  //back btn
  document.getElementById("changeDecade").innerHTML = `<a class="back-btn" href="collection.html?decade=${decade}&type=${type}">&lsaquo; Back</a>`;

  message(itemBody, "Loading....");
  try {

    //load film/tv list
    const contents = await getItemImgs(decade);
    const list = contents[type] || [];
    const content = list.find(content => content.title === title);

    //use function if title matches page address
    if (content) showContent(itemBody, content, list, decade);
    else message(itemBody, "No content found.");
  } catch (error) {
    showError(itemBody, error);
  }
}


//random item page function
async function showRandomItem() {
  const itemBody = document.getElementById("itemBody");

  //pick random decade 
  const year = decades[Math.floor(Math.random() * decades.length)];

  //decade chosen
  document.getElementById("randomLabel").textContent = `Channel ${year}`;
  message(itemBody, "Loading....");
  try {

    //load decade list and join film and tv
    const contents= await getItemImgs(year);
    const allContents = contents.film.concat(contents.tv);

    //pick random item from film and tv
    const content = allContents[Math.floor(Math.random() * allContents.length)];
    
    //use function when item is picked
    showContent(itemBody, content, allContents, year);
  } catch (error) {
    showError(itemBody, error);
  }
}


//call function for each page
const page = document.body.id;
if (page === "home") showHomepage();
if (page === "about") showAbout();
if (page === "channel") showChannel();
if (page === "collection") showCollectionContent();
if (page === "itemcard") showItem();
if (page === "random") showRandomItem();


//turn navigation dials and change page when clicked
document.querySelectorAll(".nav-items a").forEach(dial => {
  dial.addEventListener("click", event => {
    event.preventDefault();
    dial.classList.add("active");
    setTimeout(() => {
      window.location.href = dial.href;
  }, 600); 
  });
});