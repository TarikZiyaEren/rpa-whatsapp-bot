function metinOzellikleri(doktorNotu = "") {
  const not = String(doktorNotu).toLowerCase();

  return {
    kronik: not.includes("kronik"),
    diyaliz: not.includes("diyaliz"),
    acil: not.includes("acil"),
    kontrol: not.includes("kontrol"),
    ameliyat: not.includes("ameliyat"),
    kisaNot: not.trim().length > 0 && not.trim().length < 25,
    bosNot: !not.trim(),
  };
}

module.exports = { metinOzellikleri };