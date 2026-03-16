import "./style.css";
import { homepageData } from "./data/homepage.js";
import { newsData } from "./data/news.js";
import { publicationData } from "./data/publications.js";
import { patentData } from "./data/patents.js"; // 导入专利数据
import { honorsData } from "./data/honors.js";
import { educationData } from "./data/educations.js";
import { experienceData } from "./data/experience.js";
import { miscData } from "./data/misc.js";

var Q = function(s) { return document.querySelector(s); };
var QQ = function(s) { return document.querySelectorAll(s); };

function initTheme() {
  var saved = localStorage.getItem("theme");
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  var theme = saved || (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
  updateThemeIcon(theme);
}

function toggleTheme() {
  var current = document.documentElement.getAttribute("data-theme");
  var next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  var btn = Q("#themeToggle");
  if (btn) {
    btn.innerHTML = theme === "dark" ? "<i class=\"fas fa-sun\"></i>" : "<i class=\"fas fa-moon\"></i>";
  }
}

function init() {
  Q("#homeName").textContent = homepageData.name;
  Q("#homeTitle").textContent = homepageData.title;
  
  var linksContainer = Q("#homeLinks");
  linksContainer.innerHTML = "";
  
  homepageData.links.forEach(function(link) {
    var a = document.createElement("a");
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "contact-row"; 
    var icon = document.createElement("div");
    icon.className = "contact-icon";
    icon.innerHTML = "<i class=\"fas " + (link.icon || "fa-link") + "\"></i>";
    var content = document.createElement("span");
    content.className = "contact-text";
    content.textContent = link.text || link.label;
    a.appendChild(icon);
    a.appendChild(content);
    linksContainer.appendChild(a);
  });

  var footer = Q(".theme-toggle-wrapper");
  if (!Q("#themeToggle") && footer) {
    var btn = document.createElement("button");
    btn.id = "themeToggle";
    btn.className = "theme-btn";
    btn.style.cssText = "background:none; border:none; color:var(--text-muted); cursor:pointer; padding:0.75rem; display:flex; align-items:center; gap:0.5rem; font-size:1.25rem;";
    btn.onclick = toggleTheme;
    footer.appendChild(btn);
  }
  
  Q("#homeAbout").innerHTML = homepageData.about.map(function(p) { return "<p>" + p + "</p>"; }).join("");
  Q("#homeInterests").innerHTML = (homepageData.interests || []).map(function(i) { return "<span class=\"interest-tag\">" + i + "</span>"; }).join("");

  // News section
  Q("#newsList").innerHTML = newsData.map(function(item) {
    var title = item.title ? item.title : "";
    return "<div class=\"news-item\"><div class=\"news-header\"><span class=\"news-date\">" + item.date + "</span><span class=\"news-title\">" + title + "</span></div><div class=\"news-text\">" + item.body + "</div></div>";
  }).join("");

  // Honors section
  Q("#honorsList").innerHTML = honorsData.map(function(item) {
    var bodyHtml = item.body ? "<div class=\"honor-body\" style=\"font-size: 0.85em; color: var(--text-muted); margin-top: 6px; margin-left: 96px; line-height: 1.5;\">" + item.body + "</div>" : "";
    
    return "<div class=\"honor-row\" style=\"display: block; padding-bottom: 12px; margin-bottom: 12px;\">" +
             "<div style=\"display: flex; align-items: baseline; gap: 1rem;\">" +
               "<span class=\"honor-date\" style=\"min-width: 80px; color: var(--text-muted); flex-shrink: 0;\">" + item.date + "</span>" +
               "<span class=\"honor-title\" style=\"font-weight: 500;\">" + item.title + "</span>" +
             "</div>" +
             bodyHtml +
           "</div>";
  }).join("");

  var renderTimeline = function(data) {
    return data.map(function(item) {
      var descHtml = item.desc && item.desc.length ? "<div class=\"cv-desc\">" + item.desc.map(function(d) { return "<div>" + d + "</div>"; }).join("") + "</div>" : "";
      var logoHtml = "";
      if (item.logo) {
        if (item.url) {
          logoHtml = "<div class=\"cv-logo\"><a href=\"" + item.url + "\" target=\"_blank\" rel=\"noopener noreferrer\"><img src=\"" + item.logo + "\" alt=\"logo\"></a></div>";
        } else {
          logoHtml = "<div class=\"cv-logo\"><img src=\"" + item.logo + "\" alt=\"logo\"></div>";
        }
      }

      return "<div class=\"cv-item\">" +
                "<div class=\"cv-date\">" + item.date + "</div>" +
                "<div class=\"cv-content-wrapper\">" +
                    "<div class=\"cv-main\">" +
                        "<h4 class=\"cv-title\">" + item.title + "</h4>" +
                        "<div class=\"cv-sub\">" + item.sub + "</div>" + 
                        descHtml + 
                    "</div>" +
                    logoHtml +
                "</div>" +
             "</div>";
    }).join("");
  };

  Q("#eduList").innerHTML = renderTimeline(educationData);
  Q("#expList").innerHTML = renderTimeline(experienceData);

  Q("#miscList").innerHTML = miscData.map(function(item) {
    return "<div class=\"misc-item\"><div class=\"misc-category\">" + item.category + "</div><h4 class=\"misc-title\">" + item.title + "</h4><div class=\"misc-desc\">" + item.desc + "</div></div>";
  }).join("");
  
  // 分别为论文和专利渲染内容
  renderPubs(publicationData, "#pubList");
  renderPubs(patentData, "#patentList");

  initTheme();
  initNavigation();
}

function initNavigation() {
  var navLinks = QQ(".nav-link");
  var sections = QQ(".content-section");

  function updateActiveNav() {
    var scrollPos = window.scrollY + 150;
    sections.forEach(function(section) {
      var top = section.offsetTop;
      var bottom = top + section.offsetHeight;
      var id = section.getAttribute("id");
      var link = Q("a[href=\"#" + id + "\"]");
      if (link) {
        if (scrollPos >= top && scrollPos < bottom) {
          navLinks.forEach(function(l) { l.classList.remove("active"); });
          link.classList.add("active");
        }
      }
    });
  }

  window.addEventListener("scroll", updateActiveNav);
  updateActiveNav();

  navLinks.forEach(function(link) {
    link.addEventListener("click", function(e) {
      e.preventDefault();
      var targetId = link.getAttribute("href").substring(1);
      var target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

// 渲染函数：支持标题跳转和 status 标签化
function renderPubs(pubs, selector) {
  var container = Q(selector);
  if (!container) return;

  container.innerHTML = pubs.map(function(pub) {
    // 1. 处理标题链接逻辑
    var titleHtml = pub.url 
      ? "<a href=\"" + pub.url + "\" target=\"_blank\" class=\"pub-title-link\"><h3 class=\"pub-title\">" + pub.title + "</h3></a>"
      : "<h3 class=\"pub-title\">" + pub.title + "</h3>";

    // 2. 处理按钮/状态标签逻辑
    var linksHtml = pub.links
      ? Object.entries(pub.links).map(function(entry) {
          var key = entry[0];   
          var value = entry[1]; 
          
          if (key === 'status') {
            return "<span class=\"pill-link\" style=\"background-color: var(--bg-secondary); color: var(--text-muted); border: 1px dashed var(--border-color); cursor: default;\">" + value + "</span>";
          }
          
          return "<a href=\"" + value + "\" class=\"pill-link\" target=\"_blank\">" + key + "</a>";
        }).join("")
      : "";
    
    // 3. 处理图片逻辑
    var imageHtml = pub.image 
      ? "<div class=\"pub-image\"><img src=\"" + pub.image + "\" alt=\"" + pub.title + "\" onerror=\"this.parentElement.innerHTML='<div class=pub-image-placeholder><i class=fas fa-file-alt></i></div>'\" /></div>"
      : "<div class=\"pub-image\"><div class=\"pub-image-placeholder\"><i class=\"fas fa-file-alt\"></i></div></div>";
    
    return "<article class=\"pub-item\">" + imageHtml + "<div class=\"pub-content\">" + titleHtml + "<div class=\"pub-authors\">" + pub.authors + "</div><div class=\"pub-meta\"><span class=\"venue-badge\">" + pub.venue + "</span></div>" + (linksHtml ? "<div class=\"pub-links\">" + linksHtml + "</div>" : "") + "</div></article>";
  }).join("");
}

init();