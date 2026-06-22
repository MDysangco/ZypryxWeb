using Zyprix.Models;

namespace ZypryxWeb.Models.ViewModels
{
	public class HomePageModelView
	{
		public List<Coin>? Coins { get; set; }
		public List<Kline>? Klines { get; set; }
	}

	public class KlineDto
	{
		public decimal Open { get; set; }
		public decimal High { get; set; }
		public decimal Low { get; set; }
		public decimal Close { get; set; }
		public decimal Volume { get; set; }
		public long Time { get; set; }
		public string ? Signal { get; set; }
	}



}
