const menuBtn = document.querySelector('.menu-btn');
const menu = document.querySelector('.menu-lateral');
const cerrar = document.querySelector('.cerrar');
const overlay = document.querySelector('.overlay');

const abrir = () => {
  menu.classList.add('active');
  overlay.classList.add('active');
};

const cerrarMenu = () => {
  menu.classList.remove('active');
  overlay.classList.remove('active');
};

menuBtn.addEventListener('click', abrir);
cerrar.addEventListener('click', cerrarMenu);
overlay.addEventListener('click', cerrarMenu);