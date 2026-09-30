(async function () {
  const d = await fetchData();
  if (d) db = d;
  else
    setNotice({
      text: "Gagal memuat data.json. Periksa koneksi, atau kalau dibuka lewat file://, pilih filenya manual.",
      buttons: [
        {
          label: "Pilih data.json…",
          fn: () =>
            pickJson((x) => {
              db = x;
              setNotice(null);
              render();
            }),
        },
      ],
    });
  render();
})();
