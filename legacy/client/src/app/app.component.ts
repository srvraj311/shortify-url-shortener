import { Component } from '@angular/core';
import {HttpClient} from "@angular/common/http";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  visible:boolean = false;
  s_url:string = ''
  constructor(private http : HttpClient) {
  }
  convert(url: string){
      this.http.post<Response>('/api/', {url :url}).subscribe((res) => {
          this.s_url = window.location.href + res.url
          this.visible = true
      })
  }
}

interface Response{
  url : string
}
