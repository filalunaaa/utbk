try {
  var m = {
    terang: "light",
    gelap: "dark"
  }[localStorage.getItem("neon_tema")];

  if (m) document.documentElement.dataset.theme = m;
} catch (e) {}
