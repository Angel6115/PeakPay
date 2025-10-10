// app/page.tsx - VERSIÓN BASE LIMPIA
'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      title: "LOCA",
      description: "Contenido premium exclusivo",
      credits: 5,
      color: "bg-pink-500"
    },
    {
      title: "FACE", 
      description: "Descubre rostros únicos",
      credits: 3,
      color: "bg-blue-500"
    },
    {
      title: "LOCA",
      description: "Experiencias exclusivas",
      credits: 7, 
      color: "bg-green-500"
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [slides.length]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Simple */}
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-600 rounded-lg"></div>
              <span className="text-xl font-bold text-gray-900">PeekPay</span>
            </div>
            <div className="flex space-x-4">
              <button className="px-4 py-2 text-gray-600 hover:text-gray-900">Login</button>
              <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                Sign Up
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Descubre contenido único
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Revela mosaicos y apoya creadores. Paga solo por lo que quieres ver.
          </p>
          <div className="flex justify-center space-x-4">
            <button className="px-8 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700">
              Comenzar ahora
            </button>
            <button className="px-8 py-3 border border-gray-300 rounded-lg font-semibold hover:border-gray-400">
              Ver demo
            </button>
          </div>
        </div>
      </section>

      {/* Slider Section */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
          ¿Cómo funciona?
        </h2>
        
        <div className="relative h-96 max-w-4xl mx-auto">
          <div className="relative w-full h-full flex items-center justify-center">
            {slides.map((slide, index) => {
              const position = index - currentSlide;
              const translateX = position * 100;
              const scale = position === 0 ? 1 : 0.8;
              const opacity = position === 0 ? 1 : 0.5;
              
              return (
                <div
                  key={index}
                  className="absolute w-80 h-64 bg-white rounded-2xl shadow-lg transition-all duration-500 ease-in-out"
                  style={{
                    transform: `translateX(${translateX}%) scale(${scale})`,
                    opacity: opacity,
                    zIndex: position === 0 ? 10 : 1,
                  }}
                >
                  <div className={`h-20 ${slide.color} rounded-t-2xl flex items-center justify-center`}>
                    <span className="text-white text-2xl font-bold">{slide.title}</span>
                  </div>
                  <div className="p-6 text-center">
                    <p className="text-gray-600 mb-4">{slide.description}</p>
                    <div className="bg-purple-100 text-purple-700 px-4 py-2 rounded-full font-semibold inline-block">
                      {slide.credits} créditos
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Navigation Dots */}
        <div className="flex justify-center space-x-2 mt-8">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-3 h-3 rounded-full transition-all ${
                index === currentSlide ? 'bg-purple-600 w-8' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}